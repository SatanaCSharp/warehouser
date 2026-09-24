import { render, screen, within } from '@testing-library/react';
import type { CoverageGapPanel as CoverageGapPanelBody } from '@warehouser/contracts/dashboards';
import { CoverageGapPanel } from 'modules/warehouse/components/dashboard/components/coverage-gap-panel/CoverageGapPanel';
import {
  COVERAGE_GAP_LIST_HEIGHT_PX,
  ROW_ONE_PANEL_HEIGHT_PX,
} from 'modules/warehouse/utils/panel-list-budget';
import { QUANTITY_GROUP_SEPARATOR } from 'shared/utils/number-format';
import {
  PANEL_CARD_CHROME_PX,
  PANEL_LIST_HEADER_HEIGHT_PX,
  PANEL_ROW_MAX_HEIGHT_PX,
  PANEL_ROW_MIN_HEIGHT_PX,
} from 'shared/utils/panel-list-density';
import { describe, expect, it } from 'vitest';

// T17 — the Coverage Gap Panel drawn at the approved handoff's fidelity
// (AC-03, AC-05, AC-25; `design-handoff.md` § Panel specifications, frame
// `Z4cE3M`). Colocated with the component it covers
// (`docs/system/guides/placing-web-tests.md` §1: a spec's default home is the
// directory of the file it tests, named after that file).
//
// The Panel presents a collection of records, so it is drawn with HeroUI's
// `Table` (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
// §Decision). React Aria therefore owns the semantics, and these cases query
// what it exposes — `grid`, `columnheader`, `rowheader` and `gridcell` — not
// the `table`/`cell` roles the hand-assembled markup used to produce. The ADR
// records that role change under § Consequences as an accepted cost.
//
// Nothing here is rendered through the router: the Panel is a presentational
// leaf taking its projection as a prop
// (`docs/system/guides/writing-web-components.md` §3), so a plain `render` is
// the whole tree it needs — as a shared chart primitive's own spec
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

  return screen.getByRole('grid');
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

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * jsdom lays nothing out, so these cases assert the constraints the Panel
 * **declares** rather than pretending to measure them: the ceiling the list
 * region carries, the bounds of the row-height `clamp()`, and the classes that
 * decide whether a head can be sliced. Each defect below was measured in a
 * browser at 1348 x 812 first, and the declaration is what fixed it.
 */

/** What this Panel spends above its list: the legend line (16) plus
 * `.card__content`'s own `gap-1` (4). The same two numbers
 * `COVERAGE_GAP_LIST_HEIGHT_PX` is derived from, restated so the budget
 * arithmetic below is proven against the design rather than against itself. */
const LEGEND_AND_GAP_PX = 16 + 4;

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
): { max: number; min: number } => {
  const [min, , , max] = pixelsIn(declaredRowHeight(region));

  return { min, max };
};

/** What the declared `clamp()` resolves to — the arithmetic CSS would do. */
const rowHeightOf = (region: HTMLElement): number => {
  const declared = declaredRowHeight(region);
  const [min, listHeight, headerHeight, max] = pixelsIn(declared);
  const divisor = Number(/\/\s*(?<rows>\d+)\)/u.exec(declared)?.groups?.rows);

  return Math.min(Math.max((listHeight - headerHeight) / divisor, min), max);
};

/**
 * The width a column head **declares**, in pixels — Tailwind's `w-<n>` being
 * n × 4 px and `w-[Npx]` being N — or `null` for the one column that declares
 * none.
 *
 * jsdom lays nothing out, so this reads the declaration rather than measuring
 * anything. That is the whole assertion available here and it is the one worth
 * having: the table is `table-fixed`, so a declared width *is* the column's
 * width, and the single column without one absorbs whatever is left.
 */
const declaredWidthPx = (head: HTMLElement): number | null => {
  const arbitrary = /(?<![a-z-])w-\[(?<px>\d+)px\]/u.exec(head.className);

  if (arbitrary !== null) {
    return Number(arbitrary.groups?.px);
  }

  const scaled = /(?<![a-z-])w-(?<steps>\d+)(?![\d[])/u.exec(head.className);

  if (scaled === null) {
    return null;
  }

  return Number(scaled.groups?.steps) * 4;
};

const totalOf = (widths: number[]): number =>
  widths.reduce((running, width) => running + width, 0);

/** The Panel's own inner width and the floor the table never compresses below:
 * `design-handoff.md` § Grid geometry's Panel 488 less its 16 px padding. */
const PANEL_INNER_WIDTH_PX = 456;

/**
 * What the shipped shell leaves this table with its navigation rail expanded,
 * measured in Chrome — a 522 px card holding a 490 px table. It is 84 px
 * narrower than the collapsed rail's 574, so it, not the roomy case, is what
 * the column widths are judged against.
 */
const RAIL_EXPANDED_TABLE_WIDTH_PX = 490;

/** Both `px-1` paddings `PANEL_LIST_CELL_CLASS` spends inside a column, which a
 * declared width has to cover before any glyph is drawn. */
const COLUMN_SIDE_PADDING_PX = 8;

/**
 * The narrowest the Item column is ever drawn: what the 456 px floor leaves
 * once every other column has taken its declared width.
 */
const ITEM_COLUMN_FLOOR_PX = 100;

/**
 * "4 more Items" at 76 px — the widest label this Panel's row header prints,
 * measured in Chrome at its `text-xs`, and a Remainder Row wording rather than
 * an Item name. It is twelve characters, half of what § Truncation allows an
 * Item, so truncating it is a starved column rather than the rule working.
 * That is exactly what a 74 px Item column did: a 66 px content box, and
 * "4 more It…".
 */
const WIDEST_ITEM_LABEL_PX = 76;

/** A Panel of `count` Items, so a row count the projection never produces can
 * still be put to the rule. */
const panelOf = (count: number): CoverageGapPanelBody => ({
  remainder: null,
  rows: Array.from({ length: count }, (_unused, index) =>
    gapRow(`SKU-${index}`, {
      onHand: 10,
      inbound: 10,
      uncovered: 10,
      total: 30,
    }),
  ),
});

describe('CoverageGapPanel', () => {
  // `design-handoff.md` § Accessibility — "Row-oriented Panels are tables with
  // a header row, not stacks of divs, so a screen reader announces the Item
  // with each figure", and each Panel carries a visible `h2`.
  it('draws a header row beneath its own h2', () => {
    const table = drawPanel(fullPanel);

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();

    const header = headerRowOf(table);
    expect(
      within(header).getAllByRole('columnheader').length,
    ).toBeGreaterThanOrEqual(3);
    expect(within(header).queryAllByRole('gridcell')).toStrictEqual([]);
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
    const table = screen.getByRole('grid');

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
  //
  // `truncate` alone was not enough to produce one. It expands to
  // `overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap`, and
  // CSS ignores `overflow` on a non-replaced **inline** box — so the class was
  // present, this case passed, and a long SKU still ran out of its column with
  // no ellipsis at all. The block is therefore asserted beside the class.
  it('truncates an Item name past about twenty-four characters', () => {
    const table = drawPanel(fullPanel);

    const name = within(table).getByText(LONG_SKU);
    expect(name.outerHTML).toMatch(/truncate|ellipsis/u);
    expect(name.className).toMatch(/\bblock\b/u);
  });

  // `design-handoff.md` § Grid geometry — grid 639 = row 1 **355** + gap 16 +
  // row 2 268, and § Responsive behavior requires no scrolling at 1280 x 800.
  // Eleven rows at the `.table__cell` default (`px-4 py-3 text-sm` — 45 px
  // measured) drew a 648 px Panel and put 272 px of scroll on the document.
  //
  // The budget is asserted rather than measured, because jsdom lays nothing
  // out: the ceiling the list region declares, plus everything the Panel spends
  // above it, is exactly the 355 px row 1 allows — so no row count can push the
  // Panel past it.
  it('declares a list ceiling that keeps the Panel inside its row-1 budget', () => {
    const { container } = render(<CoverageGapPanel panel={fullPanel} />);
    const region = listRegionOf(container);

    expect(region.style.maxHeight).toBe(`${COVERAGE_GAP_LIST_HEIGHT_PX}px`);
    expect(
      COVERAGE_GAP_LIST_HEIGHT_PX + PANEL_CARD_CHROME_PX + LEGEND_AND_GAP_PX,
    ).toBe(ROW_ONE_PANEL_HEIGHT_PX);

    // And the eleven rows plus the header row are seated inside that ceiling at
    // the height the rule resolves to, so at this row count nothing scrolls.
    expect(
      PANEL_LIST_HEADER_HEIGHT_PX + 11 * rowHeightOf(region),
    ).toBeLessThanOrEqual(COVERAGE_GAP_LIST_HEIGHT_PX);
  });

  // `design-handoff.md` § Responsive behavior → "Row-count pressure", ruled at
  // the `tasks` gate 2026-09-21: **list rows flex between 20 px and 26 px; below
  // 20 px the Panel scrolls internally while the surface does not.**
  //
  // Three row counts, because a single one cannot tell a rule from a constant:
  // few rows reach the ceiling, eleven land between the bounds, and a count the
  // budget cannot seat floors at 20 and hands the overflow to the Panel.
  it('flexes a row between twenty and twenty-six pixels and never outside them', () => {
    const roomy = listRegionOf(
      render(<CoverageGapPanel panel={panelOf(3)} />).container,
    );
    const measured = listRegionOf(
      render(<CoverageGapPanel panel={fullPanel} />).container,
    );
    const crowded = listRegionOf(
      render(<CoverageGapPanel panel={panelOf(24)} />).container,
    );

    for (const region of [roomy, measured, crowded]) {
      expect(rowHeightBoundsOf(region)).toStrictEqual({
        min: PANEL_ROW_MIN_HEIGHT_PX,
        max: PANEL_ROW_MAX_HEIGHT_PX,
      });
    }

    expect(rowHeightOf(roomy)).toBe(PANEL_ROW_MAX_HEIGHT_PX);
    expect(rowHeightOf(measured)).toBeGreaterThan(PANEL_ROW_MIN_HEIGHT_PX);
    expect(rowHeightOf(measured)).toBeLessThan(PANEL_ROW_MAX_HEIGHT_PX);
    expect(rowHeightOf(crowded)).toBe(PANEL_ROW_MIN_HEIGHT_PX);
  });

  // The second half of the same rule: past the floor it is the **Panel** that
  // scrolls, not the surface. The ceiling does not move with the row count, and
  // the region that carries it is the one that overflows.
  it('scrolls the Panel internally rather than the surface once the floor is reached', () => {
    const crowded = listRegionOf(
      render(<CoverageGapPanel panel={panelOf(24)} />).container,
    );

    expect(crowded.style.maxHeight).toBe(`${COVERAGE_GAP_LIST_HEIGHT_PX}px`);
    expect(crowded.className).toMatch(/\boverflow-y-auto\b/u);
    expect(
      PANEL_LIST_HEADER_HEIGHT_PX + 24 * rowHeightOf(crowded),
    ).toBeGreaterThan(COVERAGE_GAP_LIST_HEIGHT_PX);
  });

  // A column **head** may not be clipped — only a datum may truncate
  // (`design-handoff.md` § Truncation). `.table__column` spends 32 px of a
  // column's width on `px-4`, which left 12 px of a 44 px column and rendered
  // "On order" as "On orde" and "Uncovered" as "Uncovere", sliced mid-glyph with
  // no ellipsis. Each head now keeps the design's 8 px gap as 4 px of padding
  // and may wrap onto the header row's second budgeted line instead.
  it('leaves every column head room to wrap rather than slicing it', () => {
    const table = drawPanel(fullPanel);
    const heads = within(table).getAllByRole('columnheader');

    expect(heads).toHaveLength(6);

    for (const head of heads) {
      expect(head.className).toMatch(/\bpx-1\b/u);
      expect(head.className).toMatch(/\bwhitespace-normal\b/u);
      expect(head.className).not.toMatch(/\btruncate\b/u);
    }

    // And the columns are never compressed below those widths: below the
    // Panel's own inner width the table keeps them and `Table.ScrollContainer`
    // scrolls, which is what stopped "On hand" degrading to "On han" at ~460 px.
    expect(table.className).toMatch(/min-w-\[456px\]/u);
  });

  // The bar cell overflowed its column by exactly the 16 px `.table__cell`
  // spends on `px-4`: a 150 px track stated in the mark was set inside a 150 px
  // column, so the bar ran into the numeric column beside it (a 166 px
  // `scrollWidth` in a 150 px `clientWidth`). The track is sized by its cell
  // now, and states no pixel width of its own.
  it('sizes the bar track to its cell rather than to a width that overflows it', () => {
    const table = drawPanel(fullPanel);
    const track = within(table)
      .getByText('SKU-ALPHA')
      .closest('tr')
      ?.querySelector<HTMLElement>('[style*="--chart-track"]');

    expect(track).not.toBeNull();
    expect(track?.className).toMatch(/\bw-full\b/u);
    expect(track?.className).not.toMatch(/(?<![a-z-])w-(?:\[|\d)/u);
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
  // interactive", and no status colour appears, because nothing here judges
  // the Warehouse.
  //
  // That section also said the Panel "takes no focus beyond the shell's own
  // navigation", and this case asserted zero `[tabindex]` for it. Presenting
  // the rows with HeroUI's `Table`
  // (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
  // §Decision) hands the collection to React Aria, which gives its rows and
  // cells roving grid navigation — the same "roving focus" that ADR records
  // under § Consequences as an accepted cost of the decision. A system ADR
  // outranks a feature design artifact, so the focus arrives and
  // § Accessibility is what needs revising.
  //
  // What the case guards is therefore restated rather than dropped, because
  // the thing worth protecting was never the tabindex count: this Panel
  // offers **no control to activate**, and nothing focusable exists outside
  // the grid's own navigation. Both still fail the moment a button, a link, a
  // field, or a stray focusable element appears.
  it('offers no control to activate and wears no status colour', () => {
    const { container } = render(<CoverageGapPanel panel={fullPanel} />);

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

// ---------------------------------------------------------------------------
// Column geometry
// ---------------------------------------------------------------------------

/**
 * A second `describe` rather than three more cases in the one above, because
 * the block above is already at `max-lines-per-function`. These are the
 * horizontal half of the same geometry the first block states vertically: what
 * each column declares, what is left for the one that declares nothing, and
 * which of the two alignments a change would take with it.
 */
describe('CoverageGapPanel column geometry', () => {
  // The four numeric columns were widened on request — On hand and On order
  // from 56, Uncovered from 70 — because 56 left a head measuring about 46 px
  // ("On order") in a 48 px content box, one glyph from wrapping. The bar cell
  // gave up the same 26 px (118 → 92), so the Item column pays nothing: the
  // track is the one element on the row whose width carries no reading, since
  // every quantity it divides is printed in a column of its own.
  //
  // Asserted as declarations, not measurements: the table is `table-fixed`, so
  // what a column declares is what it gets, and pinning the six numbers is what
  // stops one of them drifting back.
  it('declares the widened numeric columns over a narrowed bar track, not over the Item column', () => {
    const table = drawPanel(fullPanel);
    const [item, coverage, onHand, onOrder, uncovered, total] =
      within(table).getAllByRole('columnheader');

    expect(declaredWidthPx(coverage)).toBe(92);
    expect(declaredWidthPx(onHand)).toBe(64);
    expect(declaredWidthPx(onOrder)).toBe(64);
    expect(declaredWidthPx(uncovered)).toBe(80);
    expect(declaredWidthPx(total)).toBe(56);

    // The Item column declares none, which is what makes it the one that
    // absorbs the remainder — and what makes every pixel above come out of it.
    expect(declaredWidthPx(item)).toBeNull();
  });

  // No horizontal overflow at the narrowest width the shell gives this table,
  // which is the rail-expanded 490 rather than the collapsed 574. The table is
  // `table-fixed` at `w-full`, so it is exactly as wide as its container down
  // to the 456 px floor it declares; below that `Table.ScrollContainer` scrolls
  // rather than compressing a head. Nothing therefore overflows at 490 unless
  // the fixed columns alone exceed it.
  it('seats every fixed column inside the rail-expanded width and leaves the Item column the rest', () => {
    const table = drawPanel(fullPanel);
    const heads = within(table).getAllByRole('columnheader');

    const fixed = heads
      .map(declaredWidthPx)
      .filter((width): width is number => width !== null);

    // Five of the six declare a width; the sixth is Item, asserted above.
    expect(fixed).toHaveLength(heads.length - 1);

    const fixedTotal = totalOf(fixed);
    expect(fixedTotal).toBe(356);
    expect(fixedTotal).toBeLessThan(RAIL_EXPANDED_TABLE_WIDTH_PX);

    // What is left for Item at each width. It is the column § Truncation lets
    // truncate, so a small remainder costs an ellipsis rather than a clip — but
    // the floor is where the names are judged, and the floor is the 456 px one.
    expect(RAIL_EXPANDED_TABLE_WIDTH_PX - fixedTotal).toBe(134);
    expect(PANEL_INNER_WIDTH_PX - fixedTotal).toBe(ITEM_COLUMN_FLOOR_PX);

    // And the floor is wide enough for the labels the Panel actually prints.
    // It was not when the widening came out of this column instead: at 74 the
    // content box was 66 and the Remainder Row read "4 more It…".
    expect(ITEM_COLUMN_FLOOR_PX - COLUMN_SIDE_PADDING_PX).toBeGreaterThan(
      WIDEST_ITEM_LABEL_PX,
    );

    expect(table.className).toMatch(/\btable-fixed\b/u);
    expect(table.className).toMatch(/min-w-\[456px\]/u);
  });

  // The heads of the numeric columns are centred over them; their figures stay
  // right-aligned, because a `tabular-nums` quantity is read down the column
  // against a shared right edge and centring would break that comparison.
  //
  // The two survive together only because alignment is declared in two places:
  // on the `Table.Column`, which is the `<th>` alone, and on the span inside
  // each `Table.Cell`. A rule moved onto the shared cell class would take both.
  it('centres each numeric head while its figures stay right-aligned', () => {
    const table = drawPanel(fullPanel);
    const [item, , ...numeric] = within(table).getAllByRole('columnheader');

    expect(numeric).toHaveLength(4);

    for (const head of numeric) {
      expect(head.className).toMatch(/\btext-center\b/u);
      expect(head.className).not.toMatch(/\btext-(?:right|left|start)\b/u);
    }

    // The row header keeps its own alignment: centring "Item" would pull it
    // off the left-aligned names beneath it.
    expect(item.className).not.toMatch(/\btext-center\b/u);

    const alpha = rowFor(table, 'SKU-ALPHA');

    for (const figure of ['400', '600', `2${NBSP}980`, `3${NBSP}980`]) {
      const printed = within(alpha).getByText(figure, {
        normalizer: verbatim,
      });

      expect(printed.className).toMatch(/\btext-right\b/u);
      expect(printed.className).toMatch(/\btabular-nums\b/u);
    }
  });
});
