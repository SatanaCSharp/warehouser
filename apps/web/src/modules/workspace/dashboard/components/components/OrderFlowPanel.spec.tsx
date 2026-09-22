import { render, screen, within } from '@testing-library/react';
import type { OrderFlowPanel as OrderFlowPanelBody } from '@warehouser/contracts/dashboards';
import { OrderFlowPanel } from 'modules/workspace/dashboard/components/components/OrderFlowPanel';
import { describe, expect, it } from 'vitest';

// T21 — the Order Flow Panel drawn at the approved handoff's fidelity
// (AC-16, AC-17a; `design-handoff.md` § Panel specifications, frame `z5olfa`).
// Colocated with the component it covers
// (`docs/system/guides/placing-web-tests.md` §1).
//
// Unlike the row-oriented Panels, Order Flow plots weekly buckets rather than
// presenting a collection of records, so ADR
// `27-08-2026-heroui-table-for-web-data-tables.md` — which governs how a
// collection of records is presented — does not reach it, and its accessible
// substrate is not a table at all. It is the chart shape ADR
// `0002-charting-without-a-charting-dependency.md` reserves layout primitives
// for, so its accessibility is carried the way `design-handoff.md`
// § Accessibility states for charts: "Charts expose an accessible summary
// naming what they plot and the counts they exclude — the same text the
// footnote shows." That summary is asserted here as an element exposed with
// the `img` role, which is the component API these tests assume — the
// implementer may choose a different mechanism, but *something* must resolve
// `getByRole('img', { name: /.../ })` to the disclosure text for a screen
// reader to read it as one description rather than thirty-six orphaned
// numbers.
//
// This spec also assumes the component takes an optional `variant` prop
// (`'desktop' | 'mobile'`, default `'desktop'`) rather than reading a media
// query itself, so the mobile column width (14px) and the every-third-week
// label rule (`design-handoff.md` § Responsive behavior) are assertable
// without a real viewport in jsdom.

const week = (
  weekStart: string,
  {
    recorded,
    assigned,
    stillAwaited,
    cancelled,
  }: {
    recorded: number;
    assigned: number;
    stillAwaited: number;
    cancelled: number;
  },
): OrderFlowPanelBody['weeks'][number] => ({
  weekStart,
  recordedQuantity: recorded,
  assignedQuantity: assigned,
  stillAwaitedQuantity: stillAwaited,
  cancelledQuantity: cancelled,
});

/** Twelve consecutive Monday week-starts, oldest first — the shape
 * `orderFlowPanelSchema` fixes (`packages/contracts/src/dashboards/
 * dashboards-workspace-panels.ts`: "Exactly twelve weeks, oldest first"). */
const WEEK_STARTS = [
  '2026-06-29',
  '2026-07-06',
  '2026-07-13',
  '2026-07-20',
  '2026-07-27',
  '2026-08-03',
  '2026-08-10',
  '2026-08-17',
  '2026-08-24',
  '2026-08-31',
  '2026-09-07',
  '2026-09-14',
];

/** Eleven ordinary weeks, each split across all three parts of its whole, plus
 * one week (index 6, `2026-08-10`) whose whole is entirely cancelled — the
 * edge case a naive scale breaks (AC-04, AC-16; task DoD). */
const weeksWithOneFullyCancelled: OrderFlowPanelBody['weeks'] = WEEK_STARTS.map(
  (weekStart, index) => {
    if (index === 6) {
      return week(weekStart, {
        recorded: 480,
        assigned: 0,
        stillAwaited: 0,
        cancelled: 480,
      });
    }

    return week(weekStart, {
      recorded: 1000 + index * 10,
      assigned: 600 + index * 10,
      stillAwaited: 300,
      cancelled: 100,
    });
  },
);

const fullPanel: OrderFlowPanelBody = {
  timezone: 'Etc/UTC',
  archivedWarehouseCount: 0,
  weeks: weeksWithOneFullyCancelled,
};

const drawPanel = (panel: OrderFlowPanelBody): void => {
  render(<OrderFlowPanel panel={panel} />);
};

/** The component's own per-week grouping element, keyed by `weekStart`
 * (component API these tests assume). */
const weekElement = (weekStart: string): HTMLElement =>
  screen.getByTestId(`order-flow-week-${weekStart}`);

/** The three stacked segments of one week, in DOM order — which this test
 * suite treats as the bottom-up drawing order, exactly as a stacked row
 * treats DOM order as its own left-to-right drawing order. */
const segmentsOf = (weekStart: string): HTMLElement[] =>
  Array.from(weekElement(weekStart).querySelectorAll('[data-quantity]'));

describe('OrderFlowPanel', () => {
  // `design-handoff.md` § Accessibility — the visible `h2` every Panel
  // carries, and the accessible summary a chart substitutes for a table's
  // header row, naming what it plots (AC-17a's disclosure is the summary
  // text this Panel is required to carry).
  it('draws its own h2 and an accessible summary carrying the AC-17a disclosure', () => {
    drawPanel(fullPanel);

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /currently ask for/iu }),
    ).toBeInTheDocument();
  });

  // AC-16 — "pooling its Warehouses and naming none of them". The fixture
  // carries no Warehouse name anywhere for the Panel to leak, so this proves
  // the Panel invents none of its own.
  it('names no Warehouse anywhere on the Panel', () => {
    const { container } = render(<OrderFlowPanel panel={fullPanel} />);

    expect(container.textContent ?? '').not.toMatch(/warehouse/iu);
  });

  // AC-16 — "the system shows twelve weeks for the Workspace as a whole,
  // pooling its Warehouses". Twelve, never more, never fewer.
  it('draws exactly twelve week columns', () => {
    drawPanel(fullPanel);

    for (const weekStart of WEEK_STARTS) {
      expect(weekElement(weekStart)).toBeInTheDocument();
    }
    expect(screen.getAllByTestId(/^order-flow-week-/u)).toHaveLength(12);
  });

  // AC-16 — "divided bottom-up into Assigned to arrived goods → Still
  // awaited → Cancelled". DOM order pins the bottom-up sequence; the fill
  // colour pins which segment is which without a legend.
  it('stacks an ordinary week bottom-up as assigned, then still-awaited, then cancelled', () => {
    drawPanel(fullPanel);

    const segments = segmentsOf('2026-06-29');
    expect(segments).toHaveLength(3);

    const fills = segments.map(
      (segment) => segment.getAttribute('style') ?? '',
    );
    expect(fills[0]).toMatch(/--chart-ramp-4a/u);
    expect(fills[1]).toMatch(/--chart-ramp-4b/u);
    expect(fills[2]).toMatch(/--chart-ramp-4c/u);

    expect(segments.map((segment) => segment.dataset.quantity)).toStrictEqual([
      '600',
      '300',
      '100',
    ]);
  });

  // Task DoD — "A week whose whole is entirely cancelled renders correctly".
  // The cancelled segment carries the week's entire whole and the other two
  // parts are present at zero rather than the week disappearing, drawing a
  // negative bar, or losing a segment.
  it('renders a week whose whole is entirely cancelled without a negative figure', () => {
    drawPanel(fullPanel);

    const segments = segmentsOf('2026-08-10');
    expect(segments).toHaveLength(3);
    expect(segments.map((segment) => segment.dataset.quantity)).toStrictEqual([
      '0',
      '0',
      '480',
    ]);

    expect(
      screen.getByTestId('order-flow-week-2026-08-10').textContent ?? '',
    ).not.toMatch(/-\d/u);
  });

  // AC-17a — "states on the Panel that its weeks report what the Customer
  // Orders recorded in them currently ask for". The footnote is what
  // `design-handoff.md` says the accessible summary repeats verbatim in
  // substance.
  it('discloses on the footnote that its weeks report what Customer Orders currently ask for', () => {
    drawPanel(fullPanel);

    expect(screen.getByText(/currently ask for/iu)).toBeInTheDocument();
  });

  // `design-handoff.md` § Responsive behavior — "Plot 270 wide, columns
  // 14 px" on mobile against "Order Flow 18" in the desktop component mapping
  // table.
  //
  // Both widths are asserted on the one rendering, because the Panel no longer
  // takes a `variant` prop to choose between them: it carries the breakpoint
  // pair and CSS decides, the way the sibling `ArrivalTimingPanel` already
  // did. The prop it replaced had no production caller and defaulted to
  // `'desktop'`, so the mobile rendering existed only inside this spec —
  // the permanently untested path
  // `docs/system/guides/writing-web-components.md` §9 names.
  it('carries 14px columns below the breakpoint and 18px above it', () => {
    render(<OrderFlowPanel panel={fullPanel} />);

    const segment = segmentsOf('2026-06-29')[0];
    expect(segment.className).toMatch(/w-\[14px\]/u);
    expect(segment.className).toMatch(/sm:w-\[18px\]/u);
  });

  // `design-handoff.md` § Responsive behavior — "every third week labelled
  // (`W28`, `W31`, `W34`, `W37`, `W39`)" on mobile, against every week
  // labelled on desktop.
  //
  // Every week's label is in the document and the non-third ones are hidden
  // below the breakpoint, so the rule is asserted on the classes rather than
  // on presence — jsdom applies no media query, so a presence assertion could
  // only ever see one of the two treatments.
  it('hides all but every third week label below the breakpoint', () => {
    render(<OrderFlowPanel panel={fullPanel} />);

    const labels = WEEK_STARTS.map((weekStart) =>
      within(weekElement(weekStart)).getByText(/w\d+/iu),
    );

    expect(labels).toHaveLength(12);

    const alwaysShown = labels.filter(
      (label) => !label.className.includes('hidden'),
    );
    const shownAboveBreakpoint = labels.filter((label) =>
      label.className.includes('sm:inline'),
    );

    // Weeks 0, 3, 6 and 9 of the twelve.
    expect(alwaysShown).toHaveLength(4);
    expect(shownAboveBreakpoint).toHaveLength(8);
  });

  // `design-handoff.md` § Accessibility — "Never colour alone": the legend
  // names all three series as text.
  it('names all three series in a text legend', () => {
    drawPanel(fullPanel);

    for (const series of [
      'Assigned to arrived goods',
      'Still awaited',
      'Cancelled',
    ]) {
      expect(screen.getByText(series)).toBeInTheDocument();
    }
  });

  // `design-handoff.md` § States — "There is no empty state. A Panel with no
  // rows draws its frame, its legend and its axis with no marks."
  it('draws its frame and legend with no marks when every week is empty', () => {
    const emptyWeeks = WEEK_STARTS.map((weekStart) =>
      week(weekStart, {
        recorded: 0,
        assigned: 0,
        stillAwaited: 0,
        cancelled: 0,
      }),
    );

    drawPanel({
      timezone: 'Etc/UTC',
      archivedWarehouseCount: 0,
      weeks: emptyWeeks,
    });

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(screen.getAllByTestId(/^order-flow-week-/u)).toHaveLength(12);
  });

  // `design-handoff.md` § Accessibility — nothing on either surface is
  // interactive, and no status colour appears.
  it('offers nothing to focus and wears no status colour', () => {
    const { container } = render(<OrderFlowPanel panel={fullPanel} />);

    expect(screen.queryAllByRole('button')).toStrictEqual([]);
    expect(screen.queryAllByRole('link')).toStrictEqual([]);
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/--danger|--warning|--success/u);
  });
});
