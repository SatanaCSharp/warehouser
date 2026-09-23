import { render, screen, within } from '@testing-library/react';
import type { DemandPressurePanel as DemandPressurePanelBody } from '@warehouser/contracts/dashboards';
import { DemandPressurePanel } from 'modules/workspace/dashboard/components/components/demand-pressure-panel/DemandPressurePanel';
import {
  DEMAND_PRESSURE_LIST_HEIGHT_PX,
  DEMAND_PRESSURE_ROW_BOUNDS,
  ROW_ONE_PANEL_HEIGHT_PX,
} from 'modules/workspace/dashboard/utils/panel-list-budget';
import { QUANTITY_GROUP_SEPARATOR } from 'shared/utils/number-format';
import {
  PANEL_CARD_CHROME_PX,
  PANEL_LIST_HEADER_HEIGHT_PX,
  PANEL_ROW_MAX_HEIGHT_PX,
} from 'shared/utils/panel-list-density';
import { describe, expect, it } from 'vitest';

// T20 — the Demand Pressure Panel drawn at the approved handoff's fidelity
// (AC-14; `design-handoff.md` § Panel specifications, frame `DCucv`).
// Colocated with the component it covers
// (`docs/system/guides/placing-web-tests.md` §1).
//
// Drawn with HeroUI's `Table`, for the same reason `CoverageGapPanel` is:
// a feature file assembles no `<table>` markup of its own
// (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
// §Decision). These cases therefore query what React Aria exposes — `grid`,
// `columnheader`, `rowheader` and `gridcell`.
//
// **Why this cannot take a shared stacked-row primitive, as T19's
// provisional grid did.** Such a primitive lays its segments out with
// `flexGrow: segment.value` inside a *fixed-width* track — every row's
// segments always sum to that one width, so every Warehouse's bar fills the
// same length regardless of how much it actually has outstanding. That is
// exactly the "scale of shares" AC-14 forbids: it flattens a small Warehouse
// in trouble to the same bar length as a large healthy one. This Panel scales
// every row against one shared quantity domain instead, the way
// `CoverageGapPanel` scales its own rows with `shared/utils/chart-scale.ts`'s
// `linearScale` (ADR 0002) — the decisive case below is that comparison.
//
// Nothing here is rendered through the router: the Panel is a presentational
// leaf taking its projection as a prop
// (`docs/system/guides/writing-web-components.md` §3), so a plain `render` is
// the whole tree it needs.

/** Testing Library collapses U+00A0 to a plain space before comparing, so the
 * space-grouped thousands `design-handoff.md` § Type and mark specs requires
 * can only be proven with normalization turned off. */
const verbatim = (text: string): string => text;

const NBSP = QUANTITY_GROUP_SEPARATOR;

type Bands = {
  overdueQuantity: number;
  dueSoonQuantity: number;
  laterQuantity: number;
};

let nextWarehouseId = 400;

const demandRow = (
  warehouseName: string,
  { overdueQuantity, dueSoonQuantity, laterQuantity }: Bands,
): DemandPressurePanelBody['warehouses'][number] => {
  nextWarehouseId += 1;

  return {
    warehouseId: `00000000-0000-4000-8000-${String(nextWarehouseId).padStart(12, '0')}`,
    warehouseName,
    overdueQuantity,
    dueSoonQuantity,
    laterQuantity,
    totalOutstandingQuantity: overdueQuantity + dueSoonQuantity + laterQuantity,
  };
};

/**
 * The decisive AC-14 fixture: a small Warehouse almost entirely overdue
 * beside a large Warehouse mostly not — a hundredfold difference in total
 * outstanding quantity, so a scale that normalizes each row to its own total
 * (a "scale of shares") cannot be told apart from one that shares a domain
 * across every Warehouse (a "scale of quantities") unless the rendered marks
 * are actually measured.
 */
const smallTroubleWarehouse = demandRow('Small Trouble', {
  overdueQuantity: 90,
  dueSoonQuantity: 5,
  laterQuantity: 5,
});

const largeHealthyWarehouse = demandRow('Large Healthy', {
  overdueQuantity: 500,
  dueSoonQuantity: 1500,
  laterQuantity: 8000,
});

const fullPanel: DemandPressurePanelBody = {
  archivedWarehouseCount: 3,
  warehouses: [smallTroubleWarehouse, largeHealthyWarehouse],
};

const drawPanel = (panel: DemandPressurePanelBody): HTMLElement => {
  render(<DemandPressurePanel panel={panel} />);

  return screen.getByRole('grid');
};

const rowsOf = (table: HTMLElement): HTMLElement[] =>
  within(table).getAllByRole('row');

const headerRowOf = (table: HTMLElement): HTMLElement => rowsOf(table)[0];

const bodyRowsOf = (table: HTMLElement): HTMLElement[] =>
  rowsOf(table).slice(1);

const rowFor = (table: HTMLElement, label: string): HTMLTableRowElement => {
  const row = within(table).getByText(label).closest('tr');

  if (row === null) {
    throw new Error(`No table row carries the label ${label}.`);
  }

  return row;
};

/** Every mark in this Panel is a positioned box with an inline fill — one
 * element per drawn Urgency Band segment (ADR 0002: "every mark is a
 * rectangle … at a computed pixel offset", never an SVG path). */
const marksIn = (row: HTMLElement): HTMLElement[] =>
  Array.from(row.querySelectorAll<HTMLElement>('[style]'));

/**
 * The fraction of the track a mark's inline style claims. `linearScale`
 * (`shared/utils/chart-scale.ts`) is the one scale ADR 0002 gives every
 * Panel, and every existing consumer (`CoverageGapPanel`) writes its result
 * into a percentage `width`, so a row's own share of the track is the sum of
 * its segments' `width` percentages.
 */
const trackWidthPercentOf = (row: HTMLElement): number =>
  marksIn(row).reduce((total, mark) => {
    const width = mark.style.width;
    const percent = width.endsWith('%') ? Number.parseFloat(width) : 0;

    return total + (Number.isNaN(percent) ? 0 : percent);
  }, 0);

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * jsdom lays nothing out, so these cases assert the constraints the Panel
 * **declares** rather than pretending to measure them: the ceiling the list
 * region carries, the bounds of the row-height `clamp()`, and the two marks
 * that decide how short a row may be. The defect below was measured in a
 * browser at 1348 x 868 first — four rows at 51 px in a 357 px Panel where
 * `design-handoff.md` § Grid geometry allows 311 — and the declaration is what
 * fixes it.
 */

/** What this Panel spends beside its list: a legend line (16), a footnote line
 * (16), and `.card__content`'s own `gap-1` on each side of the list (4 + 4).
 * The same numbers `DEMAND_PRESSURE_LIST_HEIGHT_PX` is derived from, restated
 * so the budget arithmetic below is proven against the design rather than
 * against itself. */
const LEGEND_FOOTNOTE_AND_GAPS_PX = 16 + 16 + 4 + 4;

/** The bar `design-handoff.md` § Type and mark specs fixes at 12 px, over the
 * three band figures § Accessibility requires printed, on their own 10 px
 * line with 2 px between: the 24 px this Panel's row cannot go below. */
const BAR_AND_BAND_FIGURES_PX = 12 + 2 + 10;

/** The list region: the one element carrying the Panel's density rule — its
 * height ceiling, its internal scroll, and the row height every cell reads. */
const listRegionOf = (container: HTMLElement): HTMLElement => {
  const region = container.querySelector<HTMLElement>(
    '[data-slot="table-scroll-container"]',
  );

  if (region === null) {
    throw new Error('The Panel draws no list region.');
  }

  return region;
};

const declaredRowHeight = (region: HTMLElement): string =>
  region.style.getPropertyValue('--dashboard-row-height');

/** The pixel figures of `clamp(MINpx, calc((LISTpx - HEADERpx) / N), MAXpx)`. */
const pixelsIn = (declared: string): number[] =>
  [...declared.matchAll(/(?<px>[\d.]+)px/gu)].map(({ groups }) =>
    Number(groups?.px),
  );

const rowHeightBoundsOf = (
  region: HTMLElement,
): { maxPx: number; minPx: number } => {
  const [minPx, , , maxPx] = pixelsIn(declaredRowHeight(region));

  return { minPx, maxPx };
};

/** What the declared `clamp()` resolves to — the arithmetic CSS would do. */
const rowHeightOf = (region: HTMLElement): number => {
  const declared = declaredRowHeight(region);
  const [min, listHeight, headerHeight, max] = pixelsIn(declared);
  const divisor = Number(/\/\s*(?<rows>\d+)\)/u.exec(declared)?.groups?.rows);

  return Math.min(Math.max((listHeight - headerHeight) / divisor, min), max);
};

/** A Workspace of `count` active Warehouses, so a row count the seeded
 * Workspace never produces — §6 bounds one at 20 — can still be put to the
 * rule. */
const panelOf = (count: number): DemandPressurePanelBody => ({
  archivedWarehouseCount: 0,
  warehouses: Array.from({ length: count }, (_unused, index) =>
    demandRow(`Warehouse ${index}`, {
      overdueQuantity: 10,
      dueSoonQuantity: 10,
      laterQuantity: 10,
    }),
  ),
});

const printsFigure = (row: HTMLElement, text: string): void => {
  expect(
    within(row).getByText(text, { normalizer: verbatim }),
  ).toBeInTheDocument();
};

describe('DemandPressurePanel', () => {
  it('draws a real table with a header row beneath its own h2', () => {
    const table = drawPanel(fullPanel);

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('treegrid')).toBeNull();

    const header = headerRowOf(table);
    expect(
      within(header).getAllByRole('columnheader').length,
    ).toBeGreaterThanOrEqual(3);
    expect(within(header).queryAllByRole('gridcell')).toStrictEqual([]);
  });

  // AC-14 — "on a scale of quantities rather than of shares, so a small
  // Warehouse in trouble is not flattened beside a large healthy one". A
  // per-row scale (a "scale of shares") fills every row's track to the same
  // length; a shared quantity domain instead gives the small Warehouse a
  // track claim far below the large one's, because its actual outstanding
  // quantity is a hundredth of it.
  it('scales bars to one shared quantity domain, so the small Warehouse is not flattened beside the large one', () => {
    const table = drawPanel(fullPanel);

    const smallWidth = trackWidthPercentOf(rowFor(table, 'Small Trouble'));
    const largeWidth = trackWidthPercentOf(rowFor(table, 'Large Healthy'));

    // Guards against a Panel that drew no marks at all.
    expect(largeWidth).toBeGreaterThan(0);

    // The large Warehouse carries the Panel's largest total, so it claims
    // (close to) the full track under a shared domain.
    expect(largeWidth).toBeGreaterThan(90);
    // The small Warehouse's total is a hundredth of the large one's, so a
    // shared domain leaves it far short of the full track — the exact
    // opposite of a per-row scale, which would fill both to the same length.
    expect(smallWidth).toBeLessThan(5);
    expect(smallWidth).toBeLessThan(largeWidth / 10);
  });

  // AC-14 + `design-handoff.md` § Accessibility ("Never colour alone") — each
  // Warehouse's three Urgency Band quantities and its total are printed as
  // text, so nothing is read from the segments' colour.
  it('prints every quantity of a row as text, so nothing is read from colour', () => {
    const table = drawPanel(fullPanel);
    const large = rowFor(table, 'Large Healthy');

    printsFigure(large, '500');
    printsFigure(large, `1${NBSP}500`);
    printsFigure(large, `8${NBSP}000`);
    printsFigure(large, `10${NBSP}000`);
  });

  // `design-handoff.md` § Panel specifications — "Footnote states the number
  // of archived Warehouses excluded", from the projection's own field.
  it('states the archived-Warehouse count in its footnote, from the projection field', () => {
    drawPanel(fullPanel);

    expect(
      screen.getByText(/\b3\b/u, { normalizer: verbatim }),
    ).toBeInTheDocument();
  });

  // `design-handoff.md` § States — "One Warehouse left to show (§8):
  // Presented unchanged, comparing what there is … none says so".
  it('renders a single remaining Warehouse unchanged and says nothing about being the only one', () => {
    const onlyWarehouse = demandRow('Only Warehouse', {
      overdueQuantity: 40,
      dueSoonQuantity: 10,
      laterQuantity: 10,
    });

    const table = drawPanel({
      archivedWarehouseCount: 0,
      warehouses: [onlyWarehouse],
    });

    expect(bodyRowsOf(table)).toHaveLength(1);
    printsFigure(rowFor(table, 'Only Warehouse'), '60');
    expect(table.textContent ?? '').not.toMatch(/\bonly\b/iu);
  });

  // `design-handoff.md` § Responsive behavior — "Two-line row: Warehouse +
  // Outstanding above, full-width bar below … Same order" is a reflow of one
  // row, not a second copy of the Panel hidden at the other width. A
  // duplicated tree would read every figure to a screen reader twice.
  it('prints each figure once, so the mobile treatment is a reflow rather than a second tree', () => {
    drawPanel(fullPanel);

    expect(
      screen.getAllByText(`1${NBSP}500`, { normalizer: verbatim }),
    ).toHaveLength(1);
    expect(
      screen.getAllByText(`10${NBSP}000`, { normalizer: verbatim }),
    ).toHaveLength(1);
  });

  // `design-handoff.md` § Grid geometry — the Workspace grid is 639 = row 1
  // **311** + gap 16 + row 2 312, and § Responsive behavior requires no
  // scrolling at 1280 x 800. This Panel is row 1 (§ Panel order), and four
  // rows at the `.table__cell` default (`px-4 py-3 text-sm` — 51 px measured)
  // drew a 357 px Panel, which on its own put the surface past one screen.
  //
  // The budget is asserted rather than measured, because jsdom lays nothing
  // out: the ceiling the list region declares, plus everything the Panel
  // spends beside it, is exactly the 311 px row 1 allows — so no row count can
  // push the Panel past it.
  it('declares a list ceiling that keeps the Panel inside its row-1 budget', () => {
    const { container } = render(<DemandPressurePanel panel={fullPanel} />);
    const region = listRegionOf(container);

    expect(region.style.maxHeight).toBe(`${DEMAND_PRESSURE_LIST_HEIGHT_PX}px`);
    expect(
      DEMAND_PRESSURE_LIST_HEIGHT_PX +
        PANEL_CARD_CHROME_PX +
        LEGEND_FOOTNOTE_AND_GAPS_PX,
    ).toBe(ROW_ONE_PANEL_HEIGHT_PX);

    // And the seeded Workspace's four active Warehouses, plus the header row,
    // are seated inside that ceiling at the height the rule resolves to, so at
    // that row count nothing scrolls.
    const seeded = listRegionOf(
      render(<DemandPressurePanel panel={panelOf(4)} />).container,
    );
    expect(
      PANEL_LIST_HEADER_HEIGHT_PX + 4 * rowHeightOf(seeded),
    ).toBeLessThanOrEqual(DEMAND_PRESSURE_LIST_HEIGHT_PX);
  });

  // `design-handoff.md` § Responsive behavior → "Row-count pressure", ruled at
  // the `tasks` gate 2026-09-21: **list rows flex between 20 px and 26 px;
  // below 20 px the Panel scrolls internally while the surface does not.**
  //
  // This Panel keeps the ruled ceiling and raises the floor to 24, because its
  // row stacks the 12 px bar § Type and mark specs fixes over the three band
  // figures § Accessibility requires printed. That is the rule applied, not
  // evaded: the cell is `overflow-hidden`, so a shorter row would slice a
  // figure rather than shrink it, and the scroll below carries the rest.
  it('flexes a row inside the bounds its own marks admit and never outside them', () => {
    const roomy = listRegionOf(
      render(<DemandPressurePanel panel={panelOf(2)} />).container,
    );
    const crowded = listRegionOf(
      render(<DemandPressurePanel panel={panelOf(20)} />).container,
    );

    for (const region of [roomy, crowded]) {
      expect(rowHeightBoundsOf(region)).toStrictEqual(
        DEMAND_PRESSURE_ROW_BOUNDS,
      );
    }

    expect(DEMAND_PRESSURE_ROW_BOUNDS.maxPx).toBe(PANEL_ROW_MAX_HEIGHT_PX);
    expect(DEMAND_PRESSURE_ROW_BOUNDS.minPx).toBe(BAR_AND_BAND_FIGURES_PX);

    expect(rowHeightOf(roomy)).toBe(PANEL_ROW_MAX_HEIGHT_PX);
    expect(rowHeightOf(crowded)).toBe(DEMAND_PRESSURE_ROW_BOUNDS.minPx);
  });

  // The second half of the same rule: past the floor it is the **Panel** that
  // scrolls, not the surface. The ceiling does not move with the row count,
  // and the region that carries it is the one that overflows — so a Workspace
  // at §6's bound of 20 Warehouses still shows every one of them without the
  // Dashboard leaving one screen.
  it('scrolls the Panel internally rather than the surface once the floor is reached', () => {
    const crowded = listRegionOf(
      render(<DemandPressurePanel panel={panelOf(20)} />).container,
    );

    expect(crowded.style.maxHeight).toBe(`${DEMAND_PRESSURE_LIST_HEIGHT_PX}px`);
    expect(crowded.className).toMatch(/\boverflow-y-auto\b/u);
    expect(
      PANEL_LIST_HEADER_HEIGHT_PX + 20 * rowHeightOf(crowded),
    ).toBeGreaterThan(DEMAND_PRESSURE_LIST_HEIGHT_PX);
  });

  // The two marks the floor is made of. `design-handoff.md` § Type and mark
  // specs gives Demand Pressure a 12 px bar; it drew 10. Beneath it the three
  // band figures sit on their own 10 px line rather than the 16 px `text-xs`
  // line-height they inherited from the table — 12 + 2 + 10 is the 24 px floor
  // the case above asserts, so neither mark may quietly grow back.
  it('draws the bar at the twelve pixels the design fixes, over a band-figure line that fits the floor', () => {
    const table = drawPanel(fullPanel);
    const row = rowFor(table, 'Large Healthy');

    expect(row.querySelector('span[class~="h-3"]')).not.toBeNull();
    expect(row.querySelector('span[class~="leading-[10px]"]')).not.toBeNull();
  });

  // `design-handoff.md` § Accessibility — nothing here is interactive and no
  // status colour appears, because nothing on this Panel judges a Warehouse.
  // The tabindex count was zero until the rows were handed to HeroUI's
  // `Table`, whose React Aria collection gives them roving grid navigation —
  // a cost
  // `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
  // § Consequences records, and a system ADR outranks `design-handoff.md`
  // § Accessibility's "takes no focus". Restated rather than dropped: no
  // control to activate, and nothing focusable outside the grid.
  it('offers no control to activate and wears no status colour', () => {
    const { container } = render(<DemandPressurePanel panel={fullPanel} />);

    expect(screen.queryAllByRole('button')).toStrictEqual([]);
    expect(screen.queryAllByRole('link')).toStrictEqual([]);
    expect(container.querySelectorAll('input, select, textarea')).toHaveLength(
      0,
    );

    const focusable = Array.from(container.querySelectorAll('[tabindex]'));
    expect(focusable).not.toHaveLength(0);
    expect(
      focusable.filter((element) => element.closest('[role="grid"]') === null),
    ).toStrictEqual([]);
    expect(container.innerHTML).not.toMatch(/--danger|--warning|--success/u);
  });
});
