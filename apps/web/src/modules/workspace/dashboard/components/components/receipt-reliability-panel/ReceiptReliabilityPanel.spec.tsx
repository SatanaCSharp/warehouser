import { act, render, screen, within } from '@testing-library/react';
import type { ReceiptReliabilityPanel as ReceiptReliabilityPanelBody } from '@warehouser/contracts/dashboards';
import { ReceiptReliabilityPanel } from 'modules/workspace/dashboard/components/components/receipt-reliability-panel/ReceiptReliabilityPanel';
import type { LabelAnchor } from 'modules/workspace/dashboard/utils/receipt-reliability-plot';
import {
  labelBox,
  markBox,
} from 'modules/workspace/dashboard/utils/receipt-reliability-plot';
import { afterEach, describe, expect, it, vi } from 'vitest';

// T21 — the Receipt Reliability Panel drawn at the approved handoff's
// fidelity (AC-19, AC-20, AC-20a; `design-handoff.md` § Panel
// specifications, frame `ScGrF`). Colocated with the component it covers
// (`docs/system/guides/placing-web-tests.md` §1).
//
// The Panel owns the plot's geometry: it measures the width the Card gives it,
// resolves the design's plot geometry for that width, sizes every mark in CSS
// pixels and places every label. `BubblePlot` draws those pixels and decides
// none of them, so the geometry is asserted here, on the rendered `<circle>`
// and `<text>` elements.
//
// jsdom lays nothing out, so `getBoundingClientRect()` reports zero and the
// Panel falls back to the design's own desktop plot width (417). Every pixel
// this suite expects is therefore the desktop geometry: plot 417 × 140, marks
// up to r = 16, floor 8.7, centres inset 17 from each edge.
//
// The one exception is § "following the width the Card gives it" at the foot
// of this file, which installs a layout of its own so the measured path is
// exercised rather than only its fallback.

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
 * (2 000, at "East Dock"), so `r = 16 × √(received ÷ max received)` with the
 * design's `floor ≈ 8.7` is arithmetic this suite actually checks rather than
 * trusts: East Dock 2 000 → `16 × √1 = 16`; South Dock 1 000 →
 * `16 × √0.5 = 11.31`; West Dock 125 → `16 × √0.0625 = 4`, raised to the
 * floor of 8.7 so a Warehouse that received little still carries its label.
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
  { onTime: 60, conformance: 55, received: 1000 },
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

const plotBox = (container: HTMLElement): { width: number; height: number } => {
  const viewBox = container.querySelector('svg')?.getAttribute('viewBox');
  if (viewBox === null || viewBox === undefined) {
    throw new Error('No chart svg was rendered.');
  }

  const [, , width, height] = viewBox.split(' ').map(Number);

  return { width, height };
};

/** Every mark as it was actually drawn, read back off the DOM so the boxes
 * below are the rendered geometry rather than a recomputation of it. */
const renderedMarks = (
  container: HTMLElement,
): {
  label: string;
  cx: number;
  cy: number;
  r: number;
  labelX: number;
  labelY: number;
  labelAnchor: LabelAnchor;
}[] =>
  Array.from(container.querySelectorAll('g')).map((group) => {
    const circle = group.querySelector('circle');
    const text = group.querySelector('text');
    if (circle === null || text === null) {
      throw new Error('A mark group is missing its circle or its label.');
    }

    return {
      label: text.textContent ?? '',
      cx: Number(circle.getAttribute('cx')),
      cy: Number(circle.getAttribute('cy')),
      r: Number(circle.getAttribute('r')),
      labelX: Number(text.getAttribute('x')),
      labelY: Number(text.getAttribute('y')),
      labelAnchor: (text.getAttribute('text-anchor') ??
        'middle') as LabelAnchor,
    };
  });

const boxesOverlap = (
  one: { left: number; right: number; top: number; bottom: number },
  other: { left: number; right: number; top: number; bottom: number },
): boolean =>
  one.left < other.right &&
  other.left < one.right &&
  one.top < other.bottom &&
  other.top < one.bottom;

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
  // arithmetic is checked to the unit, not just "a bubble drew somewhere",
  // and it is checked in **CSS pixels**: the design states `r = 16` and a
  // `2 px` ring, so a mark that renders at any other size is not the design.
  it('sizes every mark in real pixels, from its share of the largest received quantity', () => {
    const { container } = render(<ReceiptReliabilityPanel panel={fullPanel} />);

    expect(
      Number(circleFor(container, 'East Dock').getAttribute('r')),
    ).toBeCloseTo(16, 5);
    expect(
      Number(circleFor(container, 'South Dock').getAttribute('r')),
    ).toBeCloseTo(16 * Math.SQRT1_2, 5);
  });

  // `design-handoff.md` § Type and mark specs — "floor ≈ 8.7". Without it a
  // Warehouse that received little draws a mark too small to carry the direct
  // label AC-19 requires of every plotted Warehouse.
  it('floors the smallest mark rather than letting it vanish', () => {
    const { container } = render(<ReceiptReliabilityPanel panel={fullPanel} />);

    // West Dock's unfloored radius is 16 × √(125 ÷ 2 000) = 4.
    expect(
      Number(circleFor(container, 'West Dock').getAttribute('r')),
    ).toBeCloseTo(8.7, 5);
  });

  // The plot spanned 140 × 140 in the middle of a 610px Card, because a fixed
  // square viewBox was fitted to the plot's height and letterboxed
  // horizontally. The plot takes its measured box instead, so it is as wide as
  // the Panel gives it and its marks stay circular.
  it('spans the width it is given rather than a square plot in the middle of it', () => {
    const { container } = render(<ReceiptReliabilityPanel panel={fullPanel} />);
    const { width, height } = plotBox(container);
    const svg = container.querySelector('svg');

    expect(width).toBeGreaterThan(height);
    expect(svg?.getAttribute('preserveAspectRatio')).not.toBe('none');
  });

  // The defect this pins: a Warehouse at 93.33 % conformance drew at cy 6.67
  // with r 16, so the top of its circle sat at −9.33 and was sliced off by the
  // plot edge. The drawable area is inset by the largest radius plus the ring,
  // so a Warehouse at 0 % or 100 % on either axis still draws whole.
  it('clips no mark at the plot edges, even at 0 % and 100 % on both axes', () => {
    const extremes: ReceiptReliabilityPanelBody = {
      archivedWarehouseCount: 0,
      warehouses: [
        warehouse('00000000-0000-4000-8000-00000000000a', 'Top Right Dock', {
          onTime: 100,
          conformance: 100,
          received: 2000,
        }),
        warehouse('00000000-0000-4000-8000-00000000000b', 'Bottom Left Dock', {
          onTime: 0,
          conformance: 0,
          received: 2000,
        }),
      ],
    };

    const { container } = render(<ReceiptReliabilityPanel panel={extremes} />);
    const { width, height } = plotBox(container);

    expect(circles(container)).toHaveLength(2);
    for (const mark of renderedMarks(container)) {
      const box = markBox(mark);

      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
      expect(box.bottom).toBeLessThanOrEqual(height);
    }
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

  // The defect this pins: collision was an equality test on the two marks'
  // coordinates, so only byte-identical rates counted as a collision. With
  // real Workspace data no two Warehouses report identical rates and every
  // label stayed centred below its mark — one of them drawn straight through
  // the neighbouring mark. These three rates are the ones that did it.
  it('overlaps no label with another label or another mark, at rates that merely sit close', () => {
    const nearby: ReceiptReliabilityPanelBody = {
      archivedWarehouseCount: 0,
      warehouses: [
        warehouse('00000000-0000-4000-8000-00000000000c', 'Hamburg Yard', {
          onTime: 80,
          conformance: 93.33,
          received: 2000,
        }),
        warehouse('00000000-0000-4000-8000-00000000000d', 'Rotterdam Dock', {
          onTime: 41.67,
          conformance: 66.67,
          received: 1424,
        }),
        warehouse('00000000-0000-4000-8000-00000000000e', 'Gdansk Terminal', {
          onTime: 50,
          conformance: 50,
          received: 356,
        }),
      ],
    };

    const { container } = render(<ReceiptReliabilityPanel panel={nearby} />);
    const marks = renderedMarks(container);

    expect(marks).toHaveLength(3);
    for (const [index, mark] of marks.entries()) {
      const box = labelBox(mark);

      for (const [otherIndex, other] of marks.entries()) {
        if (otherIndex === index) {
          continue;
        }

        expect(boxesOverlap(box, labelBox(other))).toBe(false);
        expect(boxesOverlap(box, markBox(other))).toBe(false);
      }
    }
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

/**
 * The Panel draws at the width the Card measures for it, and the viewBox is
 * that width — so any later change to it has to reach the viewBox too, or the
 * scene is fitted to a box it no longer matches and the letterboxing the
 * measured plot removed comes back on the first resize.
 *
 * Every case in the suite above renders at the unmeasured fallback, because
 * jsdom lays nothing out **and** `src/test/setup.ts` answers jsdom's missing
 * `ResizeObserver` with an inert stub — one that records no target and
 * delivers nothing. A resize cannot be driven through that stub at all, so
 * these cases install a layout and an observer of their own: the notification
 * is delivered exactly where the component subscribed, and only while it is
 * still subscribed, which is what makes the wiring (and not a fake) the
 * subject.
 *
 * It is a sibling suite rather than a nested one only so that neither describe
 * callback crosses `max-lines-per-function`.
 */
describe('ReceiptReliabilityPanel following the width the Card gives it', () => {
  type Subscription = {
    callback: ResizeObserverCallback;
    target: Element;
    live: boolean;
  };

  const subscriptions: Subscription[] = [];

  /** Honours `disconnect`/`unobserve`, so a notification is never delivered
   * to an observer the component has already torn down — the failure this
   * suite would otherwise be unable to tell apart from a working one. */
  class RecordingResizeObserver {
    private readonly mine: Subscription[] = [];

    constructor(private readonly callback: ResizeObserverCallback) {}

    observe(target: Element): void {
      const subscription = { callback: this.callback, target, live: true };

      this.mine.push(subscription);
      subscriptions.push(subscription);
    }

    unobserve(): void {
      this.silence();
    }

    disconnect(): void {
      this.silence();
    }

    private silence(): void {
      for (const subscription of this.mine) {
        subscription.live = false;
      }
    }
  }

  let laidOutWidth = 0;

  const layOutAt = (width: number): void => {
    laidOutWidth = width;
  };

  const installLayout = (width: number): void => {
    layOutAt(width);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      (): DOMRect => new DOMRect(0, 0, laidOutWidth, 0),
    );
    vi.stubGlobal('ResizeObserver', RecordingResizeObserver);
  };

  /** What the platform does when the Card's column changes width: the box
   * reports the new width, and every live observation of it is notified. */
  const resizeTo = (width: number): void => {
    layOutAt(width);

    act(() => {
      for (const { callback, target, live } of subscriptions) {
        if (live && document.body.contains(target)) {
          callback(
            [
              {
                target,
                contentRect: target.getBoundingClientRect(),
              } as ResizeObserverEntry,
            ],
            {} as ResizeObserver,
          );
        }
      }
    });
  };

  afterEach(() => {
    subscriptions.length = 0;
    laidOutWidth = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('draws at the width its container reports rather than the unmeasured fallback', () => {
    installLayout(600);

    const { container } = render(<ReceiptReliabilityPanel panel={fullPanel} />);

    expect(plotBox(container)).toStrictEqual({ width: 600, height: 140 });
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]?.live).toBe(true);
  });

  // The regression this pins: a measured width that is read once and never
  // again. The container narrows — the navigation rail expands, the window
  // resizes, the grid reflows to one column — and the viewBox keeps the width
  // of the first measurement, so the scene is scaled down and letterboxed
  // inside a box it no longer fits, and every mark is drawn smaller than the
  // design's radii.
  it('redraws at the new width when its container is resized', () => {
    installLayout(600);

    const { container } = render(<ReceiptReliabilityPanel panel={fullPanel} />);

    resizeTo(480);

    expect(plotBox(container).width).toBe(480);
    // The viewBox is the container's own box, so the scene is drawn 1:1 and
    // nothing is letterboxed into it.
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe(
      `0 0 480 ${plotBox(container).height}`,
    );
    expect(
      container.querySelector('svg')?.getAttribute('preserveAspectRatio'),
    ).not.toBe('none');
  });

  // The whole geometry follows the resize, not only the viewBox: below the
  // design's desktop plot width the plot is 200 tall with marks capped at
  // r = 12 (`design-handoff.md` § Responsive behavior).
  it('takes the mobile geometry when a resize drops it below the desktop width', () => {
    installLayout(600);

    const { container } = render(<ReceiptReliabilityPanel panel={fullPanel} />);

    expect(
      Number(circleFor(container, 'East Dock').getAttribute('r')),
    ).toBeCloseTo(16, 5);

    resizeTo(300);

    expect(plotBox(container)).toStrictEqual({ width: 300, height: 200 });
    expect(
      Number(circleFor(container, 'East Dock').getAttribute('r')),
    ).toBeCloseTo(12, 5);
  });
});
