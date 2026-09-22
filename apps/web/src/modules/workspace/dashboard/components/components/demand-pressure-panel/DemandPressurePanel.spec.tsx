import { render, screen, within } from '@testing-library/react';
import type { DemandPressurePanel as DemandPressurePanelBody } from '@warehouser/contracts/dashboards';
import { DemandPressurePanel } from 'modules/workspace/dashboard/components/components/demand-pressure-panel/DemandPressurePanel';
import { QUANTITY_GROUP_SEPARATOR } from 'shared/utils/number-format';
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
