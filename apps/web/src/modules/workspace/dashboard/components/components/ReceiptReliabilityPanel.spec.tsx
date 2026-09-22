import { render, screen, within } from '@testing-library/react';
import type { ReceiptReliabilityPanel as ReceiptReliabilityPanelBody } from '@warehouser/contracts/dashboards';
import { ReceiptReliabilityPanel } from 'modules/workspace/dashboard/components/components/ReceiptReliabilityPanel';
import { describe, expect, it } from 'vitest';

// T21 — the Receipt Reliability Panel drawn at the approved handoff's
// fidelity (AC-19, AC-20, AC-20a; `design-handoff.md` § Panel
// specifications, frame `ScGrF`). Colocated with the component it covers
// (`docs/system/guides/placing-web-tests.md` §1).
//
// Built on `shared/components/charts/BubblePlot`, which draws a mark's
// position, size and direct label but knows nothing about collision — the
// design's "moved to the side where that would collide" rule
// (AC-19) is this Panel's own arithmetic over the marks it hands `BubblePlot`,
// so this spec asserts it on the rendered `<text>` elements directly rather
// than on `BubblePlot`'s API, which stays exactly as
// `BubblePlot.spec.tsx` already pins it.
//
// This spec assumes the component takes an optional `maxRadius` prop
// (default `16`, matching `r = 16 × √(received ÷ max received)`) so a
// mobile-scoped caller can pass `12`, per `design-handoff.md` § Responsive
// behavior's "marks scaled to r ≤ 12" — the component API decision is
// recorded here rather than left implicit (see file header of
// `OrderFlowPanel.spec.tsx` for the sibling decision on that Panel).

const warehouse = (
  warehouseId: string,
  warehouseName: string,
  {
    onTime,
    conformance,
    received,
  }: { onTime: number | null; conformance: number | null; received: number },
  exclusions?: Partial<
    ReceiptReliabilityPanelBody['warehouses'][number]['exclusions']
  >,
): ReceiptReliabilityPanelBody['warehouses'][number] => ({
  warehouseId,
  warehouseName,
  onTimeArrivalRatePercent: onTime,
  conformanceRatePercent: conformance,
  receivedQuantity: received,
  exclusions: {
    undatedLineCount: 0,
    noEndingRecordedLineCount: 0,
    nothingReceivedLineCount: 0,
    directToCustomerLineCount: 0,
    unrecordedConformanceLineCount: 0,
    notApplicableConformanceLineCount: 0,
    ...exclusions,
  },
});

/**
 * Four rated Warehouses whose received quantities fix a known maximum
 * (2 000, at "North Dock"), so `r = 16 × √(received ÷ maxReceived)` is
 * arithmetic this suite actually checks rather than trusts (task DoD item 5):
 * South Dock 500 → `16 × √0.25 = 8`; East Dock 2 000 → `16 × √1 = 16`;
 * West Dock 125 → `16 × √0.0625 = 4`.
 */
const eastDock = warehouse(
  '00000000-0000-4000-8000-000000000001',
  'East Dock',
  {
    onTime: 92,
    conformance: 88,
    received: 2000,
  },
);
const southDock = warehouse(
  '00000000-0000-4000-8000-000000000002',
  'South Dock',
  { onTime: 60, conformance: 55, received: 500 },
);
const westDock = warehouse(
  '00000000-0000-4000-8000-000000000003',
  'West Dock',
  {
    onTime: 40,
    conformance: 35,
    received: 125,
  },
);

/** Positioned to collide with `southDock` — deliberately the same point,
 * (60, 55), so no reasonable collision threshold could miss it. */
const northDock = warehouse(
  '00000000-0000-4000-8000-000000000004',
  'North Dock',
  { onTime: 60, conformance: 55, received: 500 },
);

/** Every Purchase Draft Line excluded from both rates (AC-20a) — no rate to
 * report, so it must not be plotted and must be named in the footnote. */
const noRateDock = warehouse(
  '00000000-0000-4000-8000-000000000005',
  'No-Rate Dock',
  { onTime: null, conformance: null, received: 0 },
  { undatedLineCount: 4, notApplicableConformanceLineCount: 6 },
);

const fullPanel: ReceiptReliabilityPanelBody = {
  archivedWarehouseCount: 0,
  warehouses: [eastDock, southDock, westDock, northDock, noRateDock],
};

const drawPanel = (panel: ReceiptReliabilityPanelBody): void => {
  render(<ReceiptReliabilityPanel panel={panel} />);
};

const circles = (container: HTMLElement): SVGCircleElement[] =>
  Array.from(container.querySelectorAll('circle'));

const circleFor = (
  container: HTMLElement,
  warehouseName: string,
): SVGCircleElement => {
  const label = within(container).getByText(warehouseName);
  const group = label.closest('g');
  if (group === null) {
    throw new Error(`No mark group carries the label ${warehouseName}.`);
  }

  const circle = group.querySelector('circle');
  if (circle === null) {
    throw new Error(`No circle inside the mark group for ${warehouseName}.`);
  }

  return circle;
};

describe('ReceiptReliabilityPanel', () => {
  // `design-handoff.md` § Accessibility — the visible `h2`, and the
  // accessible summary a chart substitutes for a table's header row, naming
  // what it plots and the counts it excludes (AC-20a).
  it('draws its own h2 and an accessible summary naming the excluded Warehouse', () => {
    drawPanel(fullPanel);

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /no-rate dock/iu }),
    ).toBeInTheDocument();
  });

  // AC-19 — "one mark per Warehouse positioned by … On-time Arrival Rate and
  // … Conformance Rate, sized by the quantity it received". The radius
  // arithmetic is checked to the unit, not just "a bubble drew somewhere".
  it('computes each radius as 16 times the square root of its share of the largest received quantity', () => {
    const { container } = render(<ReceiptReliabilityPanel panel={fullPanel} />);

    expect(
      Number(circleFor(container, 'East Dock').getAttribute('r')),
    ).toBeCloseTo(16, 5);
    expect(
      Number(circleFor(container, 'West Dock').getAttribute('r')),
    ).toBeCloseTo(4, 5);
  });

  // AC-19 — "labels each mark with the Warehouse's name so that no legend has
  // to be consulted to read it".
  it('direct-labels every plotted mark with its Warehouse name', () => {
    const { container } = render(<ReceiptReliabilityPanel panel={fullPanel} />);

    for (const name of ['East Dock', 'South Dock', 'West Dock', 'North Dock']) {
      expect(within(container).getByText(name)).toBeInTheDocument();
    }
  });

  // AC-19 + task DoD — "Labels move aside rather than overlapping when two
  // marks collide". South Dock and North Dock sit on the same point; their
  // labels must not both render at the default centred-below position.
  it('moves a colliding label aside rather than overlapping the other', () => {
    const { container } = render(<ReceiptReliabilityPanel panel={fullPanel} />);

    const southLabel = within(container).getByText('South Dock');
    const northLabel = within(container).getByText('North Dock');

    const southPosition = [
      southLabel.getAttribute('x'),
      southLabel.getAttribute('text-anchor'),
    ];
    const northPosition = [
      northLabel.getAttribute('x'),
      northLabel.getAttribute('text-anchor'),
    ];

    expect(southPosition).not.toStrictEqual(northPosition);
  });

  // AC-20a — "the system presents that Warehouse as having no rate to report
  // rather than placing it at nothing or at everything" — not plotted at all.
  it('plots no Warehouse that has no rate', () => {
    const { container } = render(<ReceiptReliabilityPanel panel={fullPanel} />);
    const svg = container.querySelector('svg');
    if (svg === null) {
      throw new Error('No chart svg was rendered.');
    }

    expect(circles(container)).toHaveLength(4);
    expect(
      within(svg as unknown as HTMLElement).queryByText('No-Rate Dock'),
    ).toBeNull();
  });

  // AC-20a — "named in the footnote alongside every exclusion count"
  // (AC-20, AC-20a). The footnote is where a Warehouse with no rate is
  // actually disclosed, since it draws no mark at all.
  it('names the Warehouse with no rate in the footnote', () => {
    render(<ReceiptReliabilityPanel panel={fullPanel} />);

    expect(screen.getByText(/no-rate dock/iu)).toBeInTheDocument();
    expect(screen.getByText(/no rate/iu)).toBeInTheDocument();
  });

  // AC-20 — "states how much of the Warehouse's record each exclusion
  // covers". Every one of the six exclusion counts is a stated figure, not a
  // number derived by the reader.
  it('states every exclusion count on the footnote', () => {
    render(<ReceiptReliabilityPanel panel={fullPanel} />);

    // No-Rate Dock's own counts (4 undated lines, 6 Not-applicable lines) are
    // chosen so they cannot collide with any other figure on this fixture.
    expect(screen.getByText(/\b4\b/u)).toBeInTheDocument();
    expect(screen.getByText(/\b6\b/u)).toBeInTheDocument();
  });

  // Task DoD — "A Workspace where every Warehouse has no rate renders the
  // Panel with its frame, gridlines and footnote and no marks".
  it('renders its frame, gridlines and footnote with no marks when every Warehouse has no rate', () => {
    const allUnrated: ReceiptReliabilityPanelBody = {
      archivedWarehouseCount: 0,
      warehouses: [
        noRateDock,
        warehouse(
          '00000000-0000-4000-8000-000000000006',
          'Other Unrated Dock',
          { onTime: null, conformance: null, received: 0 },
          { noEndingRecordedLineCount: 3 },
        ),
      ],
    };

    const { container } = render(
      <ReceiptReliabilityPanel panel={allUnrated} />,
    );

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(circles(container)).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-testid="chart-gridline"]'),
    ).toHaveLength(3);
    expect(screen.getByText(/no-rate dock/iu)).toBeInTheDocument();
    expect(screen.getByText(/other unrated dock/iu)).toBeInTheDocument();
  });

  // `design-handoff.md` § Responsive behavior — "marks scaled to r ≤ 12" on
  // mobile, against the desktop `16` ceiling (component API decision, see
  // file header).
  it('caps every radius at 12 when a mobile maxRadius is supplied', () => {
    const { container } = render(
      <ReceiptReliabilityPanel panel={fullPanel} maxRadius={12} />,
    );

    expect(
      Number(circleFor(container, 'East Dock').getAttribute('r')),
    ).toBeCloseTo(12, 5);
  });

  // `design-handoff.md` § Accessibility — nothing on either surface is
  // interactive, and no status colour appears.
  it('offers nothing to focus and wears no status colour', () => {
    const { container } = render(<ReceiptReliabilityPanel panel={fullPanel} />);

    expect(screen.queryAllByRole('button')).toStrictEqual([]);
    expect(screen.queryAllByRole('link')).toStrictEqual([]);
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/--danger|--warning|--success/u);
  });
});
