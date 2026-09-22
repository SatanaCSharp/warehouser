import { render, screen, within } from '@testing-library/react';
import type { PurchasingSpreadPanel as PurchasingSpreadPanelBody } from '@warehouser/contracts/dashboards';
import { PurchasingSpreadPanel } from 'modules/workspace-dashboard/components/PurchasingSpreadPanel';
import { describe, expect, it } from 'vitest';

// T20 — the Purchasing Spread Panel drawn at the approved handoff's fidelity
// (AC-18; `design-handoff.md` § Panel specifications, frame `G3tB1`).
// Colocated with the component it covers
// (`docs/system/guides/placing-web-tests.md` §1).
//
// `shared/components/charts/HeatGrid` already draws a real `<table>` with a
// header row for exactly this shape (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
// — HeroUI's `Table` is for a data table a member browses, expands and sorts;
// this Panel has none of that, so it stays the plain `table`/`columnheader`/
// `cell` semantics ADR 0002 gives every row-oriented Panel). This spec covers
// the Panel wrapping it: the `h2`, the four-state coverage and its bin
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

  return screen.getByRole('table');
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
    expect(within(header).queryAllByRole('cell')).toStrictEqual([]);
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
  // `HeatGrid` already keys by bin (`shared/components/charts/HeatGrid.tsx`),
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

  // `design-handoff.md` § Accessibility — nothing here is interactive and no
  // status colour appears, because nothing on this Panel judges a Warehouse.
  it('offers nothing to focus and wears no status colour', () => {
    const { container } = render(<PurchasingSpreadPanel panel={fullPanel} />);

    expect(screen.queryAllByRole('button')).toStrictEqual([]);
    expect(screen.queryAllByRole('link')).toStrictEqual([]);
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/--danger|--warning|--success/u);
  });
});
