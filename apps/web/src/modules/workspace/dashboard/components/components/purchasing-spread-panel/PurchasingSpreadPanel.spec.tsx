import { render, screen, within } from '@testing-library/react';
import type { PurchasingSpreadPanel as PurchasingSpreadPanelBody } from '@warehouser/contracts/dashboards';
import { PurchasingSpreadPanel } from 'modules/workspace/dashboard/components/components/purchasing-spread-panel/PurchasingSpreadPanel';
import {
  PURCHASING_SPREAD_LIST_HEIGHT_PX,
  PURCHASING_SPREAD_ROW_BOUNDS,
  ROW_TWO_PANEL_HEIGHT_PX,
} from 'modules/workspace/dashboard/utils/panel-list-budget';
import {
  PANEL_CARD_CHROME_PX,
  PANEL_LIST_HEADER_HEIGHT_PX,
  PANEL_ROW_MAX_HEIGHT_PX,
} from 'shared/utils/panel-list-density';
import { describe, expect, it } from 'vitest';

// T20 — the Purchasing Spread Panel drawn at the approved handoff's fidelity
// (AC-18; `design-handoff.md` § Panel specifications, frame `G3tB1`).
// Colocated with the component it covers
// (`docs/system/guides/placing-web-tests.md` §1).
//
// `HeatGrid` presents the grid with HeroUI's `Table`
// (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
// §Decision), so these cases query the roles React Aria exposes — `grid`,
// `columnheader`, `rowheader` and `gridcell`. This spec covers the Panel
// wrapping it: the `h2`, the four-state coverage and its bin
// boundaries (AC-18), the scale legend below the grid, the "Ready" column
// head and its Panel-meta expansion, and the archived-Warehouse footnote —
// none of which `HeatGrid` itself owns.
//
// Nothing here is rendered through the router: the Panel is a presentational
// leaf taking its projection as a prop
// (`docs/system/guides/writing-web-components.md` §3), so a plain `render` is
// the whole tree it needs.

let nextWarehouseId = 500;

const spreadRow = (
  warehouseName: string,
  counts: [number, number, number, number],
): PurchasingSpreadPanelBody['warehouses'][number] => {
  nextWarehouseId += 1;

  const states = [
    'draft',
    'ready_for_ordering',
    'closed',
    'discarded',
  ] as const;

  return {
    warehouseId: `00000000-0000-4000-8000-${String(nextWarehouseId).padStart(12, '0')}`,
    warehouseName,
    counts: states.map((state, index) => ({
      state,
      draftCount: counts[index],
    })),
  };
};

/**
 * Every sequential-bin boundary the handoff names, `1–19 / 20–49 / 50–99 /
 * 100 +`, plus the distinct zero cell — spread across two Warehouses'
 * four-state rows so every one of AC-18's four states (Draft, Ready for
 * Ordering, Closed, Discarded) is exercised too.
 */
const bandBoundariesWarehouse = spreadRow('Band Boundaries', [0, 19, 20, 49]);
const upperBandsWarehouse = spreadRow('Upper Bands', [50, 99, 100, 999]);

const fullPanel: PurchasingSpreadPanelBody = {
  archivedWarehouseCount: 2,
  warehouses: [bandBoundariesWarehouse, upperBandsWarehouse],
};

const drawPanel = (panel: PurchasingSpreadPanelBody): HTMLElement => {
  render(<PurchasingSpreadPanel panel={panel} />);

  return screen.getByRole('grid');
};

const rowsOf = (table: HTMLElement): HTMLElement[] =>
  within(table).getAllByRole('row');

const headerRowOf = (table: HTMLElement): HTMLElement => rowsOf(table)[0];

const rowFor = (table: HTMLElement, label: string): HTMLTableRowElement => {
  const row = within(table).getByText(label).closest('tr');

  if (row === null) {
    throw new Error(`No table row carries the label ${label}.`);
  }

  return row;
};

/** The cell holding one Warehouse × state count, found by its printed count
 * text within that Warehouse's row — every cell prints its count, so this is
 * the one query that needs no knowledge of column order. */
const cellWithCount = (row: HTMLTableRowElement, count: number): HTMLElement =>
  within(row).getByText(String(count));

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * jsdom lays nothing out, so these cases assert the constraints the Panel
 * **declares** rather than pretending to measure them: the ceiling the grid
 * region carries, the row height its cell spec fixes, and that the region and
 * not the surface is what overflows. The defect below was measured in a
 * browser at 1348 x 868 first — four rows at 45 px in a 348 px Panel where
 * `design-handoff.md` § Grid geometry allows 312.
 */

/** What this Panel spends below its grid: the scale-legend line (16), the
 * footnote line (16), and `.card__content`'s own `gap-1` on each side of the
 * grid (4 + 4). The same numbers `PURCHASING_SPREAD_LIST_HEIGHT_PX` is derived
 * from, restated so the budget arithmetic below is proven against the design
 * rather than against itself. */
const LEGEND_FOOTNOTE_AND_GAPS_PX = 16 + 16 + 4 + 4;

/** `design-handoff.md` § Type and mark specs — "Heat-grid cell 84 × 30,
 * radius 6, count printed in every cell". */
const HEAT_CELL_HEIGHT_PX = 30;

/** The grid region: the one element carrying the Panel's density rule — its
 * height ceiling, its internal scroll, and the row height every cell reads. */
const gridRegionOf = (container: HTMLElement): HTMLElement => {
  const region = container.querySelector<HTMLElement>(
    '[data-slot="table-scroll-container"]',
  );

  if (region === null) {
    throw new Error('The Panel draws no grid region.');
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
const panelOf = (count: number): PurchasingSpreadPanelBody => ({
  archivedWarehouseCount: 0,
  warehouses: Array.from({ length: count }, (_unused, index) =>
    spreadRow(`Warehouse ${index}`, [1, 2, 3, 4]),
  ),
});

describe('PurchasingSpreadPanel', () => {
  it('draws a real table with a header row beneath its own h2, not a treegrid', () => {
    const table = drawPanel(fullPanel);

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('treegrid')).toBeNull();

    const header = headerRowOf(table);
    // One head per Warehouse column plus the four Purchase Draft states.
    expect(
      within(header).getAllByRole('columnheader').length,
    ).toBeGreaterThanOrEqual(4);
    expect(within(header).queryAllByRole('gridcell')).toStrictEqual([]);
  });

  // AC-18 — "the system shows every Warehouse against every Purchase Draft
  // state — Draft and Ready for Ordering together with Closed and Discarded"
  // — the one Panel on either surface that counts a draft the open-state rule
  // excludes everywhere else.
  it('shows every Warehouse against all four Purchase Draft states, Closed and Discarded included', () => {
    const table = drawPanel(fullPanel);

    for (const label of ['Draft', 'Ready', 'Closed', 'Discarded']) {
      expect(within(table).getByText(label)).toBeInTheDocument();
    }

    const bandBoundaries = rowFor(table, 'Band Boundaries');
    for (const count of [0, 19, 20, 49]) {
      expect(cellWithCount(bandBoundaries, count)).toBeInTheDocument();
    }

    const upperBands = rowFor(table, 'Upper Bands');
    for (const count of [50, 99, 100, 999]) {
      expect(cellWithCount(upperBands, count)).toBeInTheDocument();
    }
  });

  // `design-handoff.md` § Panel specifications — "the count printed in every
  // cell, so the fill is a scanning aid and never the only encoding". A
  // pairing with nothing in it still prints its zero rather than an empty
  // cell.
  it('prints the count in every cell, including a zero-draft pairing', () => {
    const table = drawPanel(fullPanel);
    const bandBoundaries = rowFor(table, 'Band Boundaries');

    const zeroCell = cellWithCount(bandBoundaries, 0);
    expect(zeroCell.textContent).toBe('0');
  });

  // AC-18 + `design-handoff.md` § Panel specifications — "sequential one-hue
  // bins `1–19 / 20–49 / 50–99 / 100 +` plus a `$chart/track` zero cell", so a
  // Warehouse that discards most of what it starts is distinguishable from
  // one that cannot get goods. Every boundary is checked against the fill
  // `HeatGrid` already keys by bin (`modules/workspace/dashboard/components/components/purchasing-spread-panel/components/HeatGrid.tsx`),
  // and the zero cell is required to be visibly distinct from the lowest
  // non-zero bin rather than sharing its fill.
  it('bins each non-zero count sequentially and keeps the zero cell a distinct fill', () => {
    const table = drawPanel(fullPanel);
    const bandBoundaries = rowFor(table, 'Band Boundaries');
    const upperBands = rowFor(table, 'Upper Bands');

    const fillOf = (cell: HTMLElement): string => cell.style.backgroundColor;

    const zeroFill = fillOf(cellWithCount(bandBoundaries, 0));
    const firstBinFill = fillOf(cellWithCount(bandBoundaries, 19));

    expect(zeroFill).not.toBe('');
    expect(zeroFill).not.toBe(firstBinFill);

    // Every boundary pair one bin apart carries a different fill: 19 vs 20,
    // 49 vs 50, 99 vs 100.
    expect(firstBinFill).not.toBe(fillOf(cellWithCount(bandBoundaries, 20)));
    expect(fillOf(cellWithCount(bandBoundaries, 49))).not.toBe(
      fillOf(cellWithCount(upperBands, 50)),
    );
    expect(fillOf(cellWithCount(upperBands, 99))).not.toBe(
      fillOf(cellWithCount(upperBands, 100)),
    );
  });

  // `design-handoff.md` § Panel specifications — "The column head reads
  // 'Ready'; the Panel meta expands it to 'Ready for ordering'."
  it('reads its column head as "Ready" and expands it in the Panel meta', () => {
    const table = drawPanel(fullPanel);

    const header = headerRowOf(table);
    expect(within(header).getByText('Ready')).toBeInTheDocument();
    expect(within(header).queryByText('Ready for ordering')).toBeNull();

    expect(screen.getByText(/Ready for ordering/u)).toBeInTheDocument();
  });

  // `design-handoff.md` § Panel specifications — "A scale legend sits below."
  // Five keys: the zero cell plus the four sequential bins, each stating its
  // own boundary as text so removing colour entirely loses no figure.
  it('shows a scale legend below the grid naming the zero cell and all four bins', () => {
    drawPanel(fullPanel);

    const legend = screen.getByRole('list');
    const keys = within(legend).getAllByRole('listitem');
    const keyTexts = keys.map((key) => key.textContent ?? '');

    expect(keys).toHaveLength(5);
    expect(keyTexts.some((text) => /1[\s\S]{0,3}19/u.test(text))).toBe(true);
    expect(keyTexts.some((text) => /20[\s\S]{0,3}49/u.test(text))).toBe(true);
    expect(keyTexts.some((text) => /50[\s\S]{0,3}99/u.test(text))).toBe(true);
    expect(keyTexts.some((text) => /100/u.test(text))).toBe(true);
    expect(keyTexts.some((text) => /\b0\b/u.test(text))).toBe(true);
  });

  // `design-handoff.md` § Panel specifications — the archived-Warehouse count
  // renders from its own projection field, exactly as Demand Pressure's does.
  it('states the archived-Warehouse count from the projection field', () => {
    drawPanel(fullPanel);

    expect(screen.getByText(/\b2\b/u)).toBeInTheDocument();
  });

  // `design-handoff.md` § States — "One Warehouse left to show (§8):
  // Presented unchanged, comparing what there is … none says so".
  it('renders a single remaining Warehouse unchanged and says nothing about being the only one', () => {
    const onlyWarehouse = spreadRow('Only Warehouse', [3, 4, 5, 6]);

    const table = drawPanel({
      archivedWarehouseCount: 0,
      warehouses: [onlyWarehouse],
    });

    const row = rowFor(table, 'Only Warehouse');
    for (const count of [3, 4, 5, 6]) {
      expect(cellWithCount(row, count)).toBeInTheDocument();
    }
    expect(table.textContent ?? '').not.toMatch(/\bonly\b/iu);
  });

  // `design-handoff.md` § Grid geometry — the Workspace grid is 639 = row 1
  // 311 + gap 16 + row 2 **312**, and § Responsive behavior requires no
  // scrolling at 1280 x 800. This Panel is row 2 (§ Panel order), and four
  // rows at the `.table__cell` default (`px-4 py-3 text-sm` — 45 px measured)
  // drew a 348 px Panel.
  //
  // The budget is asserted rather than measured, because jsdom lays nothing
  // out: the ceiling the grid region declares, plus everything the Panel
  // spends below it, is exactly the 312 px row 2 allows.
  it('declares a grid ceiling that keeps the Panel inside its row-2 budget', () => {
    const { container } = render(<PurchasingSpreadPanel panel={fullPanel} />);
    const region = gridRegionOf(container);

    expect(region.style.maxHeight).toBe(
      `${PURCHASING_SPREAD_LIST_HEIGHT_PX}px`,
    );
    expect(
      PURCHASING_SPREAD_LIST_HEIGHT_PX +
        PANEL_CARD_CHROME_PX +
        LEGEND_FOOTNOTE_AND_GAPS_PX,
    ).toBe(ROW_TWO_PANEL_HEIGHT_PX);

    // And the seeded Workspace's four active Warehouses, plus the header row,
    // are seated inside that ceiling at the 30 px the cell spec fixes, so at
    // that row count nothing scrolls.
    const seeded = gridRegionOf(
      render(<PurchasingSpreadPanel panel={panelOf(4)} />).container,
    );
    expect(
      PANEL_LIST_HEADER_HEIGHT_PX + 4 * rowHeightOf(seeded),
    ).toBeLessThanOrEqual(PURCHASING_SPREAD_LIST_HEIGHT_PX);
  });

  // `design-handoff.md` § Responsive behavior → "Row-count pressure", ruled at
  // the `tasks` gate 2026-09-21: **list rows flex between 20 px and 26 px;
  // below 20 px the Panel scrolls internally while the surface does not.**
  //
  // A row here is one heat-grid cell tall, and § Type and mark specs fixes
  // that cell at "84 × 30, radius 6, count printed in every cell". The count
  // is printed *inside* the fill, so flexing the row down to the ruled 20-26
  // would not be the density rule applied to this Panel — it would be the cell
  // spec abandoned to win the pixels. The bounds are therefore a point at 30,
  // above the ruled ceiling, and the second half of the rule carries the rest.
  it('holds its rows at the thirty pixels the heat-grid cell spec fixes, whatever the row count', () => {
    const roomy = gridRegionOf(
      render(<PurchasingSpreadPanel panel={panelOf(2)} />).container,
    );
    const crowded = gridRegionOf(
      render(<PurchasingSpreadPanel panel={panelOf(20)} />).container,
    );

    for (const region of [roomy, crowded]) {
      expect(rowHeightBoundsOf(region)).toStrictEqual(
        PURCHASING_SPREAD_ROW_BOUNDS,
      );
      expect(rowHeightOf(region)).toBe(HEAT_CELL_HEIGHT_PX);
    }

    expect(PURCHASING_SPREAD_ROW_BOUNDS).toStrictEqual({
      minPx: HEAT_CELL_HEIGHT_PX,
      maxPx: HEAT_CELL_HEIGHT_PX,
    });
    // Stated rather than implied: this Panel deliberately sits above the ruled
    // ceiling, and does so because the design fixes the mark in pixels.
    expect(HEAT_CELL_HEIGHT_PX).toBeGreaterThan(PANEL_ROW_MAX_HEIGHT_PX);
  });

  // The second half of the rule. §6 bounds a Workspace at 20 Warehouses, and
  // twenty 30 px cells do not fit a 312 px Panel — so it is the **grid** that
  // scrolls, not the surface. Every Warehouse is still shown, and the
  // Dashboard still holds one screen.
  it('scrolls the grid internally rather than the surface once the cells no longer fit', () => {
    const crowded = gridRegionOf(
      render(<PurchasingSpreadPanel panel={panelOf(20)} />).container,
    );

    expect(crowded.style.maxHeight).toBe(
      `${PURCHASING_SPREAD_LIST_HEIGHT_PX}px`,
    );
    expect(crowded.className).toMatch(/\boverflow-y-auto\b/u);
    expect(
      PANEL_LIST_HEADER_HEIGHT_PX + 20 * rowHeightOf(crowded),
    ).toBeGreaterThan(PURCHASING_SPREAD_LIST_HEIGHT_PX);
  });

  // The other half of the same cell spec: every count cell is drawn to the
  // row's own height, so the mark is the 30 px the design states rather than
  // whatever its text happens to occupy, and keeps its radius 6.
  it('draws every count cell to the row height at the radius the design fixes', () => {
    const table = drawPanel(fullPanel);
    const mark = cellWithCount(rowFor(table, 'Upper Bands'), 100);

    expect(mark.className).toMatch(/h-\[var\(--dashboard-row-height\)\]/u);
    expect(mark.className).toMatch(/rounded-\[6px\]/u);
  });

  // `design-handoff.md` § Accessibility — nothing here is interactive and no
  // status colour appears, because nothing on this Panel judges a Warehouse.
  // Restated for the grid's roving focus, as on every other Panel: the
  // tabindex count is React Aria's
  // (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
  // § Consequences), and what still holds is that no control is offered.
  it('offers no control to activate and wears no status colour', () => {
    const { container } = render(<PurchasingSpreadPanel panel={fullPanel} />);

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
