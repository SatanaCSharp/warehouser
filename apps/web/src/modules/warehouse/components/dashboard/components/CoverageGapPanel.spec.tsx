import { render, screen, within } from '@testing-library/react';
import type { CoverageGapPanel as CoverageGapPanelBody } from '@warehouser/contracts/dashboards';
import { CoverageGapPanel } from 'modules/warehouse/components/dashboard/components/CoverageGapPanel';
import { QUANTITY_GROUP_SEPARATOR } from 'shared/utils/number-format';
import { describe, expect, it } from 'vitest';

// T17 — the Coverage Gap Panel drawn at the approved handoff's fidelity
// (AC-03, AC-05, AC-25; `design-handoff.md` § Panel specifications, frame
// `Z4cE3M`). Colocated with the component it covers
// (`docs/system/guides/placing-web-tests.md` §1: a spec's default home is the
// directory of the file it tests, named after that file).
//
// The Panel is a real `<table>` rather than HeroUI's `Table`, which
// `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md` requires of
// a **data table** — a collection of records the member browses, expands and
// sorts. This is not one: it has no disclosure, no nesting, no expansion and
// nothing interactive at all. Its table is the accessible substrate of a chart,
// which `docs/features/dashboards/adr/0002-charting-without-a-charting-dependency.md`
// (Accepted, § Consequences) decided for exactly these Panels — "a row-oriented
// Panel can be a real `<table>` because nothing else owns its DOM, which is what
// `design-handoff.md` § Accessibility requires." So these cases query `table`,
// `columnheader` and `cell`, never `treegrid`.
//
// Nothing here is rendered through the router: the Panel is a presentational
// leaf taking its projection as a prop
// (`docs/system/guides/writing-web-components.md` §3), so a plain `render` is
// the whole tree it needs — as `shared/components/charts/StackedBarRow.spec.tsx`
// already does for the primitive beneath it.

/** Testing Library collapses U+00A0 to a plain space before comparing, so the
 * space-grouped thousands `design-handoff.md` § Type and mark specs requires
 * can only be proven with normalization turned off. */
const verbatim = (text: string): string => text;

const NBSP = QUANTITY_GROUP_SEPARATOR;

/** Past the ~24 characters `design-handoff.md` § Truncation allows an Item. */
const LONG_SKU = 'SKU-WITH-A-NAME-WELL-PAST-TWENTY-FOUR-CHARACTERS';

type Figures = {
  inbound: number;
  onHand: number;
  total: number;
  uncovered: number;
};

let nextItemId = 300;

const gapRow = (
  sku: string,
  { onHand, inbound, uncovered, total }: Figures,
): CoverageGapPanelBody['rows'][number] => {
  nextItemId += 1;

  return {
    itemId: `00000000-0000-4000-8000-${String(nextItemId).padStart(12, '0')}`,
    sku,
    totalOutstandingQuantity: total,
    onHandQuantity: onHand,
    inboundQuantity: inbound,
    uncoveredQuantity: uncovered,
  };
};

/**
 * Ten Items ordered by Uncovered Quantity descending (AC-03), with the two
 * fully covered ones last (AC-05 — "orders it below every Item that has
 * something uncovered"). The last two carry identical figures on purpose:
 * `SKU-DEACTIVATED` stands for an Item deactivated after its Customer Orders
 * were recorded, which the projection contract reports with no flag of its own,
 * so AC-25 is read as "its row is indistinguishable from the active twin
 * beside it".
 */
const rows = [
  gapRow('SKU-ALPHA', {
    onHand: 400,
    inbound: 600,
    uncovered: 2980,
    total: 3980,
  }),
  gapRow('SKU-BRAVO', {
    onHand: 310,
    inbound: 120,
    uncovered: 1460,
    total: 1890,
  }),
  gapRow('SKU-CHARLIE', {
    onHand: 210,
    inbound: 130,
    uncovered: 940,
    total: 1280,
  }),
  gapRow('SKU-DELTA', {
    onHand: 180,
    inbound: 140,
    uncovered: 870,
    total: 1190,
  }),
  gapRow('SKU-ECHO', {
    onHand: 170,
    inbound: 150,
    uncovered: 760,
    total: 1080,
  }),
  gapRow('SKU-FOXTROT', {
    onHand: 160,
    inbound: 175,
    uncovered: 650,
    total: 985,
  }),
  gapRow('SKU-GOLF', { onHand: 155, inbound: 165, uncovered: 540, total: 860 }),
  gapRow(LONG_SKU, { onHand: 145, inbound: 185, uncovered: 430, total: 760 }),
  gapRow('SKU-ACTIVE-TWIN', {
    onHand: 100,
    inbound: 50,
    uncovered: 0,
    total: 150,
  }),
  gapRow('SKU-DEACTIVATED', {
    onHand: 100,
    inbound: 50,
    uncovered: 0,
    total: 150,
  }),
];

/** No figure on it is a bare `7`, so `\b7\b` can only be the Item count it
 * states (AC-03: "one Remainder Row that states how many Items it holds"). */
const remainder: NonNullable<CoverageGapPanelBody['remainder']> = {
  itemCount: 7,
  totalOutstandingQuantity: 620,
  onHandQuantity: 90,
  inboundQuantity: 80,
  uncoveredQuantity: 450,
};

const fullPanel: CoverageGapPanelBody = { rows, remainder };

const drawPanel = (panel: CoverageGapPanelBody): HTMLElement => {
  render(<CoverageGapPanel panel={panel} />);

  return screen.getByRole('table');
};

const rowsOf = (table: HTMLElement): HTMLElement[] =>
  within(table).getAllByRole('row');

/** The header row `design-handoff.md` § Accessibility requires, proven to be a
 * header row rather than a first data row: every one of its cells is a
 * `columnheader` and none of them is a `cell`. */
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

/** Every mark in this Panel is a positioned box with an inline fill — the bar
 * track plus one element per drawn segment (ADR 0002: "every mark is a
 * rectangle … at a computed pixel offset", never an SVG path). Counting them is
 * how AC-05's "simply has no third segment" is read off the DOM. */
const marksIn = (row: HTMLElement): Element[] =>
  Array.from(row.querySelectorAll('[style]'));

const printsFigure = (row: HTMLElement, text: string): void => {
  expect(
    within(row).getByText(text, { normalizer: verbatim }),
  ).toBeInTheDocument();
};

describe('CoverageGapPanel', () => {
  // `design-handoff.md` § Accessibility — "Row-oriented Panels are tables with
  // a header row, not stacks of divs, so a screen reader announces the Item
  // with each figure", and each Panel carries a visible `h2`.
  it('draws a real table with a header row beneath its own h2', () => {
    const table = drawPanel(fullPanel);

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();

    const header = headerRowOf(table);
    expect(
      within(header).getAllByRole('columnheader').length,
    ).toBeGreaterThanOrEqual(3);
    expect(within(header).queryAllByRole('cell')).toStrictEqual([]);
  });

  // AC-03 — at most ten Items, in the order the projection fixed, so two
  // members reading the same Warehouse see the same ten in the same order. The
  // expected order is written out rather than derived from the fixture, so the
  // case cannot pass by comparing the rendering against itself.
  it('shows the ten Items in the order the projection gave them', () => {
    const table = drawPanel(fullPanel);

    const rendered = bodyRowsOf(table)
      .slice(0, 10)
      .map((row) => row.firstElementChild?.textContent);

    expect(rendered).toStrictEqual([
      'SKU-ALPHA',
      'SKU-BRAVO',
      'SKU-CHARLIE',
      'SKU-DELTA',
      'SKU-ECHO',
      'SKU-FOXTROT',
      'SKU-GOLF',
      LONG_SKU,
      'SKU-ACTIVE-TWIN',
      'SKU-DEACTIVATED',
    ]);
  });

  // AC-03 + `design-handoff.md` § Accessibility ("Removing colour entirely
  // loses no figure") — each row divides into its On-hand, Inbound and
  // Uncovered quantities, and prints its total beside them.
  it('prints every quantity of a row as text, so nothing is read from colour', () => {
    const table = drawPanel(fullPanel);
    const alpha = rowFor(table, 'SKU-ALPHA');

    printsFigure(alpha, '400');
    printsFigure(alpha, '600');
    printsFigure(alpha, `2${NBSP}980`);
    printsFigure(alpha, `3${NBSP}980`);
  });

  // AC-03 — "gathers every remaining Item into one Remainder Row that states
  // how many Items it holds", muted (`design-handoff.md` § Panel
  // specifications).
  it('gathers the rest into one muted Remainder Row stating how many Items it holds', () => {
    const table = drawPanel(fullPanel);
    const body = bodyRowsOf(table);

    expect(body).toHaveLength(11);

    const remainderRow = body[10];
    expect(
      within(remainderRow).getByText(/\b7\b/u, { normalizer: verbatim }),
    ).toBeInTheDocument();
    expect(remainderRow.outerHTML).toMatch(/muted/u);
  });

  // AC-03 control — the Remainder Row is drawn because something was gathered
  // into it, not unconditionally. Without this case the one above would pass
  // for a Panel that always draws an eleventh row.
  it('draws no Remainder Row when the projection gathered nothing into one', () => {
    const table = drawPanel({ rows, remainder: null });

    expect(bodyRowsOf(table)).toHaveLength(10);
    expect(
      within(table).queryByText(/\b7\b/u, { normalizer: verbatim }),
    ).toBeNull();
  });

  // AC-05 — "shows that Item as having nothing uncovered rather than a negative
  // quantity or a surplus": the row draws one mark fewer than a row with
  // something uncovered, and prints the zero rather than omitting the figure
  // (`design-handoff.md`: "An Item with nothing uncovered simply has no third
  // segment").
  it('drops the third segment of a fully covered Item and still prints its zero', () => {
    const table = drawPanel(fullPanel);

    const uncovered = marksIn(rowFor(table, 'SKU-ALPHA'));
    const covered = marksIn(rowFor(table, 'SKU-ACTIVE-TWIN'));

    // Guards the comparison against a row that drew nothing at all.
    expect(uncovered.length).toBeGreaterThanOrEqual(3);
    expect(covered).toHaveLength(uncovered.length - 1);

    printsFigure(rowFor(table, 'SKU-ACTIVE-TWIN'), '0');
  });

  // AC-05 — and no row ever states a negative quantity or a surplus.
  it('states no negative quantity anywhere on the Panel', () => {
    const table = drawPanel(fullPanel);

    expect(table.textContent ?? '').not.toMatch(/-\d/u);
  });

  // AC-25 — "the system shows that Item with its outstanding quantity and its
  // On-hand Quantity exactly as it shows an active one". The projection carries
  // no activation flag, so the assertion is that the deactivated Item's row is
  // cell-for-cell what its active twin's row is, and that nothing marks the
  // withdrawal.
  it('renders a deactivated Item exactly as it renders an active one', () => {
    const table = drawPanel(fullPanel);

    const active = rowFor(table, 'SKU-ACTIVE-TWIN');
    const deactivated = rowFor(table, 'SKU-DEACTIVATED');

    for (const figure of ['100', '50', '0', '150']) {
      printsFigure(active, figure);
      printsFigure(deactivated, figure);
    }

    // Everything past the name column, cell for cell: the deactivated Item's
    // row carries no extra cell, no chip and no marker of the withdrawal. The
    // guard below keeps the comparison from passing on two empty rows.
    const figuresOf = (row: HTMLTableRowElement): (string | null)[] =>
      Array.from(row.children)
        .slice(1)
        .map((cell) => cell.textContent);

    expect(figuresOf(active)).toContain('150');
    expect(figuresOf(deactivated)).toStrictEqual(figuresOf(active));
    expect(marksIn(deactivated)).toHaveLength(marksIn(active).length);
  });

  // `design-handoff.md` § States — "There is no empty state. A Panel with no
  // rows draws its frame, its legend and its axis with no marks; it is not
  // withheld."
  it('draws its frame, legend and header row with no marks when there is nothing to show', () => {
    const { container } = render(
      <CoverageGapPanel panel={{ rows: [], remainder: null }} />,
    );
    const table = screen.getByRole('table');

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();

    // The legend names all three series as text and still draws its three
    // swatches. With no row on the Panel, a `--chart-*` fill can only be a
    // legend key — which is what makes this also the assertion that no *mark*
    // was drawn.
    for (const series of ['On hand', 'On order', 'Uncovered']) {
      expect(screen.getAllByText(series).length).toBeGreaterThanOrEqual(1);
    }
    expect(
      container.querySelectorAll('[style*="--chart-"]').length,
    ).toBeGreaterThanOrEqual(3);

    expect(rowsOf(table)).toHaveLength(1);
    expect(bodyRowsOf(table)).toStrictEqual([]);
  });

  // `design-handoff.md` § Type and mark specs — space-grouped thousands, never
  // a comma, and `tabular-nums` in every column of figures.
  it('groups thousands with a space in a tabular-nums column, never with a comma', () => {
    const table = drawPanel(fullPanel);

    const total = within(table).getByText(`3${NBSP}980`, {
      normalizer: verbatim,
    });
    expect(total.closest('[class*="tabular-nums"]')).not.toBeNull();
    expect(table.textContent ?? '').not.toContain(',');
  });

  // `design-handoff.md` § Truncation — an Item name past about 24 characters
  // truncates with an ellipsis in its column on desktop.
  it('truncates an Item name past about twenty-four characters', () => {
    const table = drawPanel(fullPanel);

    const name = within(table).getByText(LONG_SKU);
    expect(name.outerHTML).toMatch(/truncate|ellipsis/u);
  });

  // `design-handoff.md` § Responsive behavior — the mobile treatment is the
  // same row reflowed ("Same 11 rows, same order"), not a second copy of the
  // Panel hidden at the other width. A duplicated tree would read every figure
  // to a screen reader twice, which is exactly what the table structure exists
  // to prevent.
  it('prints each figure once, so the mobile treatment is a reflow rather than a second tree', () => {
    drawPanel(fullPanel);

    expect(
      screen.getAllByText(`2${NBSP}980`, { normalizer: verbatim }),
    ).toHaveLength(1);
    expect(
      screen.getAllByText(`3${NBSP}980`, { normalizer: verbatim }),
    ).toHaveLength(1);
  });

  // `design-handoff.md` § Accessibility — "Nothing on either surface is
  // interactive, so neither takes focus beyond the shell's own navigation",
  // and no status colour appears, because nothing here judges the Warehouse.
  it('offers nothing to focus and wears no status colour', () => {
    const { container } = render(<CoverageGapPanel panel={fullPanel} />);

    expect(screen.queryAllByRole('button')).toStrictEqual([]);
    expect(screen.queryAllByRole('link')).toStrictEqual([]);
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/--danger|--warning|--success/u);
  });
});
