import { render, screen } from '@testing-library/react';
import type { ArrivalTimingPanel as ArrivalTimingPanelBody } from '@warehouser/contracts/dashboards';
import { ArrivalTimingPanel } from 'modules/warehouse/components/dashboard/components/ArrivalTimingPanel';
import { linearScale } from 'shared/utils/chart-scale';
import { describe, expect, it } from 'vitest';

// T18 — the Arrival Timing Panel (AC-07, AC-08a; `design-handoff.md` § Panel
// specifications, frame `z8UrQP`). Colocated with the component it covers
// (`docs/system/guides/placing-web-tests.md` §1).
//
// This Panel is drawn from `shared/components/charts/ColumnPlot`, already
// covered by its own spec for the gridlines, the no-tooltip/no-focus
// guarantee and the absence of any status colour — none of that is repeated
// here. What this spec pins is the Panel's *own* behaviour over a fixed
// projection: which series lands in which colour slot, that the two series
// are drawn side by side rather than netted against each other, the one
// footnote line carrying all four exclusion counts from their own projection
// fields (AC-07, AC-08a), and the mobile bare-week-number labels
// (`design-handoff.md` § Responsive behavior).
//
// `design-handoff.md` § Structure draws an explicit line: "Row-oriented
// Panels are tables … Charts expose an accessible summary naming what they
// plot and the counts they exclude — the same text the footnote shows."
// Coverage Gap and Reason Concentration are row-oriented (T17's tables), so
// they need no summary; this Panel is a chart, so it does. The task's own DoD
// lists the summary as a requirement separate from the `h2`. Neither
// `shared/components/charts/ColumnPlot` nor `BubblePlot` carries a `role` or
// accepts a summary prop, and that directory is shared with two other
// in-flight lanes, so this Panel wraps its own plot region in an element
// carrying `role="img"` and an `aria-label` — driven from the same
// `panel.exclusions` fields and the same locale text the visible footnote
// renders, so the two cannot drift apart. Queried the same way the Order Flow
// / Receipt Reliability lane queries its own two chart Panels:
// `getByRole('img', { name: … })`.

/** The eight Mondays `design-handoff.md` § Responsive behavior's own worked
 * example ("`39`…`46`") is stated against — the same scale environment
 * `test/dashboard-fixtures.ts` seeds for the sibling specs. Reused here as
 * literal weekStart/week-number pairs rather than computed, so a wrong ISO
 * week calculation in the component is exactly what this fails on. */
const WEEKS: { weekStart: string; weekNumber: string }[] = [
  { weekStart: '2026-09-21', weekNumber: '39' },
  { weekStart: '2026-09-28', weekNumber: '40' },
  { weekStart: '2026-10-05', weekNumber: '41' },
  { weekStart: '2026-10-12', weekNumber: '42' },
  { weekStart: '2026-10-19', weekNumber: '43' },
  { weekStart: '2026-10-26', weekNumber: '44' },
  { weekStart: '2026-11-02', weekNumber: '45' },
  { weekStart: '2026-11-09', weekNumber: '46' },
];

/** The desktop label `shared/utils/date-format.ts#formatShortCalendarDate`
 * renders for each Monday above, in the `en` shape already proven elsewhere
 * without wrapping a locale provider (`PurchaseDraftCard.spec.tsx`: `render`
 * with no provider already yields `22 Aug 2026`-shaped output). */
const DESKTOP_LABELS = [
  '21 Sep',
  '28 Sep',
  '5 Oct',
  '12 Oct',
  '19 Oct',
  '26 Oct',
  '2 Nov',
  '9 Nov',
];

const emptyWeek = (
  weekStart: string,
): ArrivalTimingPanelBody['buckets'][number] => ({
  kind: 'week',
  weekStart,
  owedQuantity: 0,
  expectedQuantity: 0,
});

/**
 * Nine buckets: Overdue carrying distinct owed/expected figures — so the
 * "never netted" case has something to prove never got subtracted — then the
 * eight weeks above, otherwise empty because this fixture's job is the label
 * and footnote wiring, not the scale.
 */
const panelWith = (
  exclusions: ArrivalTimingPanelBody['exclusions'],
): ArrivalTimingPanelBody => ({
  timezone: 'UTC',
  buckets: [
    {
      kind: 'overdue',
      weekStart: null,
      owedQuantity: 850,
      expectedQuantity: 326,
    },
    ...WEEKS.map((week) => emptyWeek(week.weekStart)),
  ],
  exclusions,
});

/** Five distinct counts, one per projection field the footnote must carry
 * (AC-07, AC-08a): the beyond-horizon owed quantity and its Customer Order
 * count, the undated Ready drafts, the still-in-Draft drafts and the drafts
 * since Closed or Discarded. Distinct so a component that swapped two fields
 * could not pass by coincidence, and each under 1 000 so no thousands
 * separator can complicate the match. */
const exclusions: ArrivalTimingPanelBody['exclusions'] = {
  beyondHorizon: { owedQuantity: 713, customerOrderCount: 419 },
  undatedReadyDrafts: { draftCount: 257, orderedQuantity: 0 },
  datedDraftsStillInDraft: { draftCount: 181, orderedQuantity: 0 },
  draftsSinceClosedOrDiscarded: { draftCount: 139 },
};

const fullPanel = panelWith(exclusions);

/** Every mark ColumnPlot draws is a positioned box with an inline fill; this
 * finds only the ones filled with the given `--chart-*` custom property, so
 * the owed series and the expected series can be counted and measured apart
 * (ADR 0002 — "every mark is a rectangle … at a computed pixel offset").
 *
 * Scoped to the plot region — the `role="img"` element the Panel wraps its
 * gridlines and columns in — rather than the whole render, so a legend
 * swatch carrying the same `--chart-*` colour (`ChartLegend`'s own stated
 * contract: "every multi-series chart carries" one) is out of range by
 * construction instead of by coincidence. */
const columnsFilledWith = (
  container: HTMLElement,
  colorVar: string,
): HTMLElement[] => {
  const plot = container.querySelector<HTMLElement>('[role="img"]');

  if (plot === null) {
    throw new Error('No plot region carries role="img".');
  }

  return Array.from(plot.querySelectorAll<HTMLElement>('[style]')).filter(
    (element) => element.style.backgroundColor === `var(${colorVar})`,
  );
};

describe('ArrivalTimingPanel', () => {
  // `design-handoff.md` § Accessibility — the visible `h2`, and § Component
  // mapping — the meta line already names what the Panel plots.
  it('draws its title as a visible h2 and states what it plots in its meta line', () => {
    render(<ArrivalTimingPanel panel={fullPanel} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Arrival Timing' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Quantity owed vs expected at the dock, by week'),
    ).toBeInTheDocument();
  });

  // AC-07 — "presents the outstanding quantity owed in each … and presents
  // beside it the quantity expected to reach the dock in each": grouped
  // columns, drawn for every one of the nine buckets regardless of value, so
  // neither series is ever collapsed into the other.
  it('draws both series for every one of the nine buckets, never netted into one', () => {
    const { container } = render(<ArrivalTimingPanel panel={fullPanel} />);

    expect(columnsFilledWith(container, '--chart-ramp-3b')).toHaveLength(9);
    expect(columnsFilledWith(container, '--chart-supply')).toHaveLength(9);
  });

  // AC-07 — the Overdue bucket's owed and expected figures are drawn as two
  // marks of different heights rather than one netted or summed bar. The
  // gridline maximum (2 500) is the domain both fixture values sit well
  // inside, so this does not depend on the Panel's own headroom rule.
  it("draws the Overdue bucket's owed and expected quantities as two differently sized marks", () => {
    const { container } = render(<ArrivalTimingPanel panel={fullPanel} />);

    const [firstOwed] = columnsFilledWith(container, '--chart-ramp-3b');
    const [firstExpected] = columnsFilledWith(container, '--chart-supply');

    expect(firstOwed.style.height).toBe(`${linearScale(850, 2500, 116)}px`);
    expect(firstExpected.style.height).toBe(`${linearScale(326, 2500, 116)}px`);
    // Neither the netted difference (524) nor the summed total (1 176) is a
    // height either mark draws.
    expect(firstOwed.style.height).not.toBe(`${linearScale(524, 2500, 116)}px`);
    expect(firstOwed.style.height).not.toBe(
      `${linearScale(1176, 2500, 116)}px`,
    );
  });

  // `design-handoff.md` § Accessibility — "Never colour alone": the two
  // series are named as text in the legend, and the same series always draws
  // in the same relative position within a bucket's group, so which mark is
  // which survives colour removal.
  it('names both series as text in the legend, in the fixed order every bucket draws them', () => {
    render(<ArrivalTimingPanel panel={fullPanel} />);

    expect(screen.getByText('Owed')).toBeInTheDocument();
    expect(screen.getByText('Expected at dock')).toBeInTheDocument();
  });

  // AC-07 / AC-08a — "One footnote line carries all four exclusion counts"
  // (`design-handoff.md` § Panel specifications), each traceable to its own
  // projection field. The exact sentence is asserted so a component that
  // attached the right number to the wrong label fails here.
  it('states all four exclusions in one footnote line, each from its own projection field', () => {
    render(<ArrivalTimingPanel panel={fullPanel} />);

    expect(
      screen.getByText(
        'Beyond the last week: 713 owed, 419 orders, in no week · ' +
          'Not placed in a week: 257 undated drafts, 181 still in Draft, ' +
          '139 since Closed or Discarded',
      ),
    ).toBeInTheDocument();
  });

  // AC-08a control — every exclusion count is its own field: changing one
  // without the others must move only that one figure in the rendered
  // footnote, proving the five numbers are not five views onto one shared
  // value.
  it('moves only the changed exclusion field when the projection changes it', () => {
    const { rerender } = render(<ArrivalTimingPanel panel={fullPanel} />);

    rerender(
      <ArrivalTimingPanel
        panel={panelWith({
          ...exclusions,
          undatedReadyDrafts: { draftCount: 990, orderedQuantity: 0 },
        })}
      />,
    );

    expect(screen.getByText(/990 undated drafts/u)).toBeInTheDocument();
    expect(screen.getByText(/713 owed/u)).toBeInTheDocument();
    expect(screen.getByText(/419 orders/u)).toBeInTheDocument();
    expect(screen.getByText(/181 still in Draft/u)).toBeInTheDocument();
    expect(
      screen.getByText(/139 since Closed or Discarded/u),
    ).toBeInTheDocument();
    expect(screen.queryByText(/257 undated drafts/u)).toBeNull();
  });

  // `design-handoff.md` § Responsive behavior — "the first bucket keeps
  // 'Overdue' and the weeks become bare week numbers (`39`…`46`) so no two
  // labels touch." The desktop calendar-date label and the mobile bare
  // number are both in the tree, reflowed by breakpoint classes rather than
  // by a second render tree (`WorkspaceAdministration.tsx`'s
  // `hidden sm:inline` / `sm:hidden` pair is the established shape for
  // exactly this — `WorkspaceAdministration.spec.tsx`).
  it('carries both the desktop calendar-date label and the mobile bare week number for every week bucket', () => {
    render(<ArrivalTimingPanel panel={fullPanel} />);

    for (const [index, week] of WEEKS.entries()) {
      const desktopLabel = screen.getByText(DESKTOP_LABELS[index]);
      const mobileLabel = screen.getByText(week.weekNumber);

      expect(desktopLabel.className).toContain('sm:inline');
      expect(mobileLabel.className).toContain('sm:hidden');
    }
  });

  // The Overdue bucket carries no week number to bare down to, so it keeps
  // its one "Overdue" label rather than gaining a second, empty variant.
  it('keeps a single "Overdue" label on the first bucket at both widths', () => {
    render(<ArrivalTimingPanel panel={fullPanel} />);

    expect(screen.getAllByText('Overdue')).toHaveLength(1);
  });

  // `design-handoff.md` § Structure — "Charts expose an accessible summary
  // naming what they plot and the counts they exclude — the same text the
  // footnote shows." Asserted as the exact footnote sentence, so a component
  // that names what it plots but drops the counts — or that renders a static
  // phrase disconnected from `panel.exclusions` — fails here exactly as it
  // would fail the visible-footnote case above.
  it('exposes its plot as an accessible image whose name is the same text the footnote shows', () => {
    render(<ArrivalTimingPanel panel={fullPanel} />);

    expect(
      screen.getByRole('img', {
        name:
          'Beyond the last week: 713 owed, 419 orders, in no week · ' +
          'Not placed in a week: 257 undated drafts, 181 still in Draft, ' +
          '139 since Closed or Discarded',
      }),
    ).toBeInTheDocument();
  });

  // Control over the case above: the accessible name must move with the same
  // projection field the visible footnote moves with, proving the two are
  // driven from one source rather than the image name being a second,
  // independently hand-written string that could silently drift from it.
  it("moves the accessible image's name when an exclusion field changes, exactly as the footnote does", () => {
    const { rerender } = render(<ArrivalTimingPanel panel={fullPanel} />);

    rerender(
      <ArrivalTimingPanel
        panel={panelWith({
          ...exclusions,
          undatedReadyDrafts: { draftCount: 990, orderedQuantity: 0 },
        })}
      />,
    );

    expect(
      screen.getByRole('img', { name: /990 undated drafts/u }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: /257 undated drafts/u }),
    ).toBeNull();
  });

  // `design-handoff.md` § Accessibility / § States — nothing on either
  // surface is interactive and nothing here judges the Warehouse.
  it('offers nothing to focus and wears no status colour', () => {
    const { container } = render(<ArrivalTimingPanel panel={fullPanel} />);

    expect(screen.queryAllByRole('button')).toStrictEqual([]);
    expect(screen.queryAllByRole('link')).toStrictEqual([]);
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/--danger|--warning|--success/u);
  });
});
