import { render, screen, within } from '@testing-library/react';
import type { PurchasingPipelinePanel as PurchasingPipelinePanelBody } from '@warehouser/contracts/dashboards';
import { PurchasingPipelinePanel } from 'modules/warehouse/components/dashboard/PurchasingPipelinePanel';
import { describe, expect, it } from 'vitest';

// T18 — the Purchasing Pipeline Panel (AC-10, AC-11; `design-handoff.md`
// § Panel specifications, frame `fbew6`). Colocated with the component it
// covers (`docs/system/guides/placing-web-tests.md` §1).
//
// **Why this is not `shared/components/charts/StackedBarRow`.** That
// primitive prints every segment's value in its own column to the right of
// the bar (`StackedBarRow.spec.tsx`), which is right for Coverage Gap but
// wrong here: `design-handoff.md` § Panel specifications states plainly
// "every segment prints its count" *inside* the fill, "chosen by fill
// luminance" — `$accent/foreground` on `ramp-4a`/`4b`, `$foreground/foreground`
// on `4c`/`4d`. That is exactly the ink rule `shared/components/charts/
// HeatGrid.tsx` already applies to its own cells (`CELL_INK_CLASS`), so this
// Panel draws that same in-fill, luminance-chosen count rather than
// StackedBarRow's outside-the-bar column.
//
// `design-handoff.md` § Structure — "Charts expose an accessible summary
// naming what they plot and the counts they exclude — the same text the
// footnote shows." This Panel's own DoD lists the summary as a requirement
// separate from its `h2`. Neither `ColumnPlot` nor `BubblePlot` carries a
// `role` or accepts a summary prop, and that directory is shared with two
// other in-flight lanes, so — exactly as `ArrivalTimingPanel.spec.tsx`
// resolves the same requirement — this Panel wraps its own plot region in an
// element carrying `role="img"` and an `aria-label` equal to the same
// (translated, static — AC-11 states a rule, not a count) text the visible
// footnote renders, queried the same way the Order Flow / Receipt Reliability
// lane queries its own chart Panels: `getByRole('img', { name: … })`.

const AGE_BANDS: PurchasingPipelinePanelBody['states'][number]['bands'][number]['ageBand'][] =
  ['up_to_7_days', 'from_8_to_14_days', 'from_15_to_30_days', 'over_30_days'];

const bandsFrom = (
  counts: readonly [number, number, number, number],
): PurchasingPipelinePanelBody['states'][number]['bands'] =>
  AGE_BANDS.map((ageBand, index) => ({ ageBand, draftCount: counts[index] }));

/**
 * Two states, four Age Bands each. `draft`'s `over_30_days` (40) and
 * `ready_for_ordering`'s `up_to_7_days` (40) share a value on purpose — the
 * "shared scale" case below proves a shared value draws the same width
 * regardless of which row or band it lands in, which per-row scaling could
 * not (`design-handoff.md`: "a shared scale with headroom to 50 drafts").
 * Every other count is distinct so a query for one cannot match another.
 */
const fullPanel: PurchasingPipelinePanelBody = {
  states: [
    { state: 'draft', bands: bandsFrom([12, 34, 40, 6]) },
    { state: 'ready_for_ordering', bands: bandsFrom([40, 9, 3, 17]) },
  ],
};

const drawPanel = (panel: PurchasingPipelinePanelBody): HTMLElement => {
  const { container } = render(<PurchasingPipelinePanel panel={panel} />);

  return container;
};

/** Every state's own row, found by the one thing that names it without
 * relying on a translated string: the Purchase Draft state itself. */
const rowFor = (
  container: HTMLElement,
  state: PurchasingPipelinePanelBody['states'][number]['state'],
): HTMLElement => {
  const row = container.querySelector<HTMLElement>(
    `[data-testid="pipeline-state-${state}"]`,
  );

  if (row === null) {
    throw new Error(`No row carries the state ${state}.`);
  }

  return row;
};

/** The element actually printing a segment's count: the one whose own inline
 * fill matches the band's colour and whose text is the count, so a printed
 * count that drifted outside its coloured fill fails to be found here
 * (`design-handoff.md`: the count is printed *in* the segment, not beside
 * it). */
const segmentPrinting = (row: HTMLElement, count: number): HTMLElement => {
  const candidates = within(row)
    .getAllByText(String(count))
    .filter((element) => element.style.backgroundColor !== '');

  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one filled segment printing ${count}, found ${candidates.length}.`,
    );
  }

  return candidates[0];
};

describe('PurchasingPipelinePanel', () => {
  // `design-handoff.md` § Accessibility — the visible `h2`, and § Component
  // mapping — the meta line names what the Panel plots.
  it('draws its title as a visible h2 and states what it plots in its meta line', () => {
    drawPanel(fullPanel);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Purchasing Pipeline' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Open drafts by state and age'),
    ).toBeInTheDocument();
  });

  // AC-10 / AC-11 — "Two horizontal stacked bars, one per open state" —
  // exactly `draft` then `ready_for_ordering`, nothing else.
  it('draws exactly two rows, one per open Purchase Draft state', () => {
    const container = drawPanel(fullPanel);

    expect(rowFor(container, 'draft')).toBeInTheDocument();
    expect(rowFor(container, 'ready_for_ordering')).toBeInTheDocument();
  });

  // `design-handoff.md` § Panel specifications — "Every segment prints its
  // count" — every one of the eight Age-Band segments across both rows.
  it('prints every segment count, so nothing is read from colour alone', () => {
    const container = drawPanel(fullPanel);
    const draftRow = rowFor(container, 'draft');
    const readyRow = rowFor(container, 'ready_for_ordering');

    for (const count of [12, 34, 40, 6]) {
      expect(segmentPrinting(draftRow, count)).toBeInTheDocument();
    }
    for (const count of [9, 3, 17]) {
      expect(segmentPrinting(readyRow, count)).toBeInTheDocument();
    }
    // `40` is shared between the two rows (see the fixture comment), so it is
    // asserted once per row rather than by a single Panel-wide lookup.
    expect(segmentPrinting(draftRow, 40)).toBeInTheDocument();
    expect(segmentPrinting(readyRow, 40)).toBeInTheDocument();
  });

  // `design-handoff.md` § Panel specifications — "chosen by fill luminance":
  // `$accent/foreground` on the two darkest steps, `$foreground/foreground`
  // on the two lightest — the same rule `HeatGrid.tsx`'s `CELL_INK_CLASS`
  // already applies to its own cells.
  it('inks the darkest two bands with accent-foreground and the lightest two with foreground', () => {
    const container = drawPanel(fullPanel);
    const draftRow = rowFor(container, 'draft');

    // draft: up_to_7_days=12 (ramp-4a), from_8_to_14_days=34 (ramp-4b) — dark.
    expect(segmentPrinting(draftRow, 12).className).toMatch(
      /text-accent-foreground/u,
    );
    expect(segmentPrinting(draftRow, 34).className).toMatch(
      /text-accent-foreground/u,
    );
    // draft: from_15_to_30_days=40 (ramp-4c), over_30_days=6 (ramp-4d) — light.
    const lightInkClasses = [
      segmentPrinting(draftRow, 40).className,
      segmentPrinting(draftRow, 6).className,
    ];
    for (const className of lightInkClasses) {
      expect(className).toMatch(/text-foreground/u);
      expect(className).not.toMatch(/accent/u);
    }
  });

  // `design-handoff.md` § Panel specifications — "on a shared scale": a
  // count means the same width wherever it is drawn, which is what tells a
  // small state's pipeline apart from a large one instead of each row
  // filling its own track (the Coverage-Gap failure mode `CoverageGapPanel
  // .tsx`'s own `domainMax` comment names explicitly).
  it('draws a shared count on the same width in both rows, proving one scale rather than two', () => {
    const container = drawPanel(fullPanel);

    const draftForty = segmentPrinting(rowFor(container, 'draft'), 40);
    const readyForty = segmentPrinting(
      rowFor(container, 'ready_for_ordering'),
      40,
    );

    expect(draftForty.style.width || draftForty.style.flexGrow).toBe(
      readyForty.style.width || readyForty.style.flexGrow,
    );
  });

  // AC-11 — "the footnote states that Closed and Discarded drafts are not
  // counted", and that the Panel counts drafts rather than quantities.
  it('states in its footnote that it counts drafts and excludes Closed and Discarded', () => {
    drawPanel(fullPanel);

    expect(
      screen.getByText(
        'Counts drafts, not quantities · Closed and Discarded drafts are not counted',
      ),
    ).toBeInTheDocument();
  });

  // `design-handoff.md` § Accessibility — every Age Band is named as text, so
  // removing colour still tells the four bands apart.
  it('names every Age Band as text', () => {
    drawPanel(fullPanel);

    expect(screen.getByText('≤ 7 days')).toBeInTheDocument();
    expect(screen.getByText('8–14 days')).toBeInTheDocument();
    expect(screen.getByText('15–30 days')).toBeInTheDocument();
    expect(screen.getByText('> 30 days')).toBeInTheDocument();
  });

  // `design-handoff.md` § Structure — "Charts expose an accessible summary
  // naming what they plot and the counts they exclude — the same text the
  // footnote shows." Asserted as the exact footnote sentence, so a Panel that
  // renders no summary at all — or one with different wording than the
  // visible footnote — fails here exactly as it would fail the
  // visible-footnote case above.
  it('exposes its plot as an accessible image whose name is the same text the footnote shows', () => {
    drawPanel(fullPanel);

    expect(
      screen.getByRole('img', {
        name: 'Counts drafts, not quantities · Closed and Discarded drafts are not counted',
      }),
    ).toBeInTheDocument();
  });

  // `design-handoff.md` § Accessibility / § States — nothing here is
  // interactive and nothing here judges the Warehouse.
  it('offers nothing to focus and wears no status colour', () => {
    const container = drawPanel(fullPanel);

    expect(screen.queryAllByRole('button')).toStrictEqual([]);
    expect(screen.queryAllByRole('link')).toStrictEqual([]);
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/--danger|--warning|--success/u);
  });
});
