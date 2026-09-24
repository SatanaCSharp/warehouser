import { render, screen, within } from '@testing-library/react';
import type { ReasonConcentrationPanel as ReasonConcentrationPanelBody } from '@warehouser/contracts/dashboards';
import { ReasonConcentrationPanel } from 'modules/warehouse/components/dashboard/components/reason-concentration-panel/ReasonConcentrationPanel';
import {
  REASON_CONCENTRATION_LIST_HEIGHT_PX,
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

// T17 — the Reason Concentration Panel drawn at the approved handoff's
// fidelity (AC-12; `design-handoff.md` § Panel specifications, frame `CZvHc`).
// Colocated with the component it covers
// (`docs/system/guides/placing-web-tests.md` §1).
//
// The Panel is **not a Pareto chart**: a quantity bar against a cumulative-%
// line is a dual-axis plot that invents a correlation the data does not
// contain, so the running share AC-12 requires is a numeric column. Undecided
// and By-customer are numeric columns for a second reason — a Rejection can be
// both undecided and customer-reported, so stacking them inside one bar would
// double-count it. Two cases below assert that arithmetic never reaches the
// screen.
//
// Drawn with HeroUI's `Table`, for the reason recorded in
// `CoverageGapPanel.spec.tsx`: a feature file assembles no `<table>` markup of
// its own
// (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
// §Decision). These cases therefore query what React Aria exposes — `grid`,
// `columnheader`, `rowheader` and `gridcell`.

/** Testing Library collapses U+00A0 to a plain space before comparing, so the
 * space-grouped thousands `design-handoff.md` § Type and mark specs requires
 * can only be proven with normalization turned off. */
const verbatim = (text: string): string => text;

const NBSP = QUANTITY_GROUP_SEPARATOR;

/** Past the ~21 characters `design-handoff.md` § Truncation allows a Reason. */
const LONG_REASON = 'A Rejection Reason wording far past twenty-one characters';

type ReasonFigures = {
  byCustomer: number;
  cumulative: number;
  refused: number;
  undecided: number;
};

const reasonRow = (
  rejectionReasonId: string,
  label: string,
  { refused, undecided, byCustomer, cumulative }: ReasonFigures,
): ReasonConcentrationPanelBody['rows'][number] => ({
  rejectionReasonId,
  label,
  refusedQuantity: refused,
  sharePercent: 0,
  cumulativeSharePercent: cumulative,
  undecidedQuantity: undecided,
  customerReportedQuantity: byCustomer,
});

/**
 * Ten Reasons ordered by refused quantity descending (AC-12). The leading row's
 * figures are chosen so that the two sums a double-count would produce —
 * 640 + 810 = 1 450, and 2 980 + 640 + 810 = 4 430 — appear nowhere else on the
 * Panel, which is what makes their absence evidence.
 */
const rows = [
  reasonRow('damaged_in_transit', 'Damaged in transit', {
    refused: 2980,
    undecided: 640,
    byCustomer: 810,
    cumulative: 40,
  }),
  reasonRow('wrong_item_shipped', 'Wrong item shipped', {
    refused: 1220,
    undecided: 330,
    byCustomer: 210,
    cumulative: 56,
  }),
  reasonRow('expired_on_arrival', 'Expired on arrival', {
    refused: 980,
    undecided: 125,
    byCustomer: 155,
    cumulative: 69,
  }),
  reasonRow('packaging_breached', 'Packaging breached', {
    refused: 765,
    undecided: 215,
    byCustomer: 95,
    cumulative: 79,
  }),
  reasonRow('short_shipment', 'Short shipment', {
    refused: 525,
    undecided: 85,
    byCustomer: 60,
    cumulative: 86,
  }),
  reasonRow('mislabelled_carton', 'Mislabelled carton', {
    refused: 415,
    undecided: 55,
    byCustomer: 35,
    cumulative: 92,
  }),
  reasonRow('contaminated_goods', 'Contaminated goods', {
    refused: 255,
    undecided: 30,
    byCustomer: 25,
    cumulative: 95,
  }),
  reasonRow('long_wording', LONG_REASON, {
    refused: 185,
    undecided: 20,
    byCustomer: 15,
    cumulative: 97,
  }),
  reasonRow('unreadable_barcode', 'Unreadable barcode', {
    refused: 125,
    undecided: 10,
    byCustomer: 10,
    cumulative: 99,
  }),
  reasonRow('refused_at_delivery', 'Refused at delivery', {
    refused: 85,
    undecided: 5,
    byCustomer: 5,
    cumulative: 100,
  }),
];

/** No figure on it is a bare `6`, so `\b6\b` can only be the Reason count it
 * states (AC-12: "one Remainder Row that states how many Reasons it holds"). */
const remainder: NonNullable<ReasonConcentrationPanelBody['remainder']> = {
  reasonCount: 6,
  refusedQuantity: 255,
  undecidedQuantity: 70,
  customerReportedQuantity: 90,
};

const fullPanel: ReasonConcentrationPanelBody = {
  totalRefusedQuantity: 7535,
  rows,
  remainder,
};

const drawPanel = (panel: ReasonConcentrationPanelBody): HTMLElement => {
  render(<ReasonConcentrationPanel panel={panel} />);

  return screen.getByRole('grid');
};

const rowsOf = (table: HTMLElement): HTMLElement[] =>
  within(table).getAllByRole('row');

const bodyRowsOf = (table: HTMLElement): HTMLElement[] =>
  rowsOf(table).slice(1);

const rowFor = (table: HTMLElement, label: string): HTMLTableRowElement => {
  const row = within(table).getByText(label).closest('tr');

  if (row === null) {
    throw new Error(`No table row carries the label ${label}.`);
  }

  return row;
};

/** Every mark is a positioned box with an inline fill (ADR 0002), so counting
 * the inline-styled elements in a row counts the bar track plus its drawn
 * segments. */
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
 * jsdom lays nothing out, so these cases assert what the Panel **declares** —
 * the list region's ceiling, the bounds of the row-height `clamp()`, and the
 * classes that decide whether a head or a figure can be sliced. Each defect was
 * measured in a browser at 1348 x 812 first: a 513 px table inside a 490 px
 * card, "Cum." rendered as "Cu" with its figures cut at the card edge,
 * "Undecided" as "Undecid", and 65 px rows against the design's 26, because the
 * refused figure wrapped below its own bar.
 */

/** The list region: the one element carrying the density rule — its height
 * ceiling, its internal scroll, and the row height every cell reads. */
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
 * none. jsdom lays nothing out, so the declaration is what is asserted; the
 * table is `table-fixed`, so a declared width *is* the column's width and the
 * column without one absorbs the remainder.
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
 * measured in Chrome — a 522 px card holding a 490 px table, 84 px narrower
 * than the collapsed rail's 574. It is the width the columns are judged
 * against.
 */
const RAIL_EXPANDED_TABLE_WIDTH_PX = 490;

/** Both `px-1` paddings `PANEL_LIST_COLUMN_CLASS` spends inside a column, which
 * a declared width has to cover before any glyph is drawn. */
const COLUMN_SIDE_PADDING_PX = 8;

/**
 * `100%` — the widest figure the running-share column ever prints — at 34 px,
 * measured in Chrome at this Panel's `text-xs` `tabular-nums`. The column
 * declared 40 px before this change, which is a 32 px content box: the figure
 * was two pixels from being sliced, on the row every Panel eventually draws.
 */
const WIDEST_SHARE_FIGURE_PX = 34;

/**
 * The narrowest the Reason column is ever drawn: what the 456 px floor leaves
 * once every other column has taken its declared width.
 */
const REASON_COLUMN_FLOOR_PX = 148;

/**
 * "Documentation missing" at 133 px — the widest Reason this Warehouse names
 * that § Truncation still expects to fit, measured in Chrome at this Panel's
 * `text-xs`. It is 21 characters, which is the threshold itself ("longer than
 * about 21 characters … truncates"), so it is the last wording the column has
 * to seat whole.
 *
 * The one Reason above it is "Packaging not as instructed" at 157 px and 27
 * characters — past the threshold, and deliberately left to truncate. Seating
 * it would have cost another 24 px, all of it out of a bar track that has none
 * to give.
 */
const WIDEST_UNTRUNCATED_REASON_PX = 133;

/** A Panel of `count` Reasons, so a row count the projection never produces can
 * still be put to the rule. */
const panelOf = (count: number): ReasonConcentrationPanelBody => ({
  remainder: null,
  totalRefusedQuantity: count * 100,
  rows: Array.from({ length: count }, (_unused, index) =>
    reasonRow(`reason_${index}`, `Reason ${index}`, {
      refused: 100,
      undecided: 10,
      byCustomer: 10,
      cumulative: 100,
    }),
  ),
});

/** The eight rows the seeded Warehouse produces, which is the row count the
 * one-screen budget was measured against. */
const EIGHT_ROWS = 8;

describe('ReasonConcentrationPanel', () => {
  // `design-handoff.md` § Accessibility — "Row-oriented Panels are tables with
  // a header row … so a screen reader announces the Reason with each figure",
  // and each Panel carries a visible `h2`.
  it('draws a real table with a header row beneath its own h2', () => {
    const table = drawPanel(fullPanel);

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();

    const header = rowsOf(table)[0];
    expect(
      within(header).getAllByRole('columnheader').length,
    ).toBeGreaterThanOrEqual(4);
    expect(within(header).queryAllByRole('gridcell')).toStrictEqual([]);
  });

  // AC-12 — "shows the Rejection Reasons ordered by refused quantity from
  // largest down". Written out rather than derived from the fixture, so the
  // case cannot pass by comparing the rendering against itself.
  it('shows the Reasons in the order the projection gave them', () => {
    const table = drawPanel(fullPanel);

    const rendered = bodyRowsOf(table)
      .slice(0, 10)
      .map((row) => row.firstElementChild?.textContent);

    expect(rendered).toStrictEqual([
      'Damaged in transit',
      'Wrong item shipped',
      'Expired on arrival',
      'Packaging breached',
      'Short shipment',
      'Mislabelled carton',
      'Contaminated goods',
      LONG_REASON,
      'Unreadable barcode',
      'Refused at delivery',
    ]);
  });

  // AC-12 — "distinguishes within each Reason both the quantity whose
  // Disposition is still Undecided and the quantity refused by the end customer
  // rather than at the dock so that the two are never read as one", plus the
  // running share across the Reasons.
  it('prints the refused, Undecided, By-customer and running-share figures as separate columns', () => {
    const table = drawPanel(fullPanel);
    const damaged = rowFor(table, 'Damaged in transit');

    printsFigure(damaged, `2${NBSP}980`);
    printsFigure(damaged, '640');
    printsFigure(damaged, '810');
    printsFigure(damaged, '40%');
  });

  // AC-12 + `design-handoff.md` § Panel specifications — "Undecided and
  // By-customer are columns, not sub-segments: a Rejection can be both
  // undecided and customer-reported, so stacking them inside one bar would
  // double-count." Neither sum may appear anywhere on the Panel; the control
  // proves the query finds a grouped figure that genuinely is printed.
  it('states neither sum a stacked treatment would produce', () => {
    drawPanel(fullPanel);

    expect(
      screen.getAllByText(`2${NBSP}980`, { normalizer: verbatim }),
    ).toHaveLength(1);
    expect(
      screen.queryAllByText(`1${NBSP}450`, { normalizer: verbatim }),
    ).toStrictEqual([]);
    expect(
      screen.queryAllByText(`4${NBSP}430`, { normalizer: verbatim }),
    ).toStrictEqual([]);
  });

  // AC-12 — and the bar itself carries the refused quantity alone, never three
  // stacked segments.
  it('draws one mark per Reason rather than stacking three segments', () => {
    const table = drawPanel(fullPanel);
    const marks = marksIn(rowFor(table, 'Damaged in transit'));

    expect(marks.length).toBeGreaterThanOrEqual(1);
    expect(marks.length).toBeLessThanOrEqual(2);
  });

  // AC-12 — "gathers any Reason beyond the tenth into one Remainder Row that
  // states how many Reasons it holds", muted
  // (`design-handoff.md` § Panel specifications).
  it('gathers the rest into one muted Remainder Row stating how many Reasons it holds', () => {
    const table = drawPanel(fullPanel);
    const body = bodyRowsOf(table);

    expect(body).toHaveLength(11);

    const remainderRow = body[10];
    expect(
      within(remainderRow).getByText(/\b6\b/u, { normalizer: verbatim }),
    ).toBeInTheDocument();
    expect(remainderRow.outerHTML).toMatch(/muted/u);
  });

  // AC-12 — "presenting no Remainder Row at all while nothing has been gathered
  // into it". Ten Reasons and nothing gathered is ten rows, not eleven with a
  // row of zeros.
  it('draws no Remainder Row at all while nothing has been gathered into one', () => {
    const table = drawPanel({
      totalRefusedQuantity: 7535,
      rows,
      remainder: null,
    });

    expect(bodyRowsOf(table)).toHaveLength(10);
    expect(
      within(table).queryAllByText(/\b6\b/u, { normalizer: verbatim }),
    ).toStrictEqual([]);
  });

  // `design-handoff.md` § States — "There is no empty state. A Panel with no
  // rows draws its frame, its legend and its axis with no marks; it is not
  // withheld."
  it('draws its frame and header row with no marks when there is nothing to show', () => {
    const table = drawPanel({
      totalRefusedQuantity: 0,
      rows: [],
      remainder: null,
    });

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(rowsOf(table)).toHaveLength(1);
    expect(bodyRowsOf(table)).toStrictEqual([]);
  });

  // `design-handoff.md` § Type and mark specs — space-grouped thousands, never
  // a comma, and `tabular-nums` in every column of figures.
  it('groups thousands with a space in a tabular-nums column, never with a comma', () => {
    const table = drawPanel(fullPanel);

    const refused = within(table).getByText(`1${NBSP}220`, {
      normalizer: verbatim,
    });
    expect(refused.closest('[class*="tabular-nums"]')).not.toBeNull();
    expect(table.textContent ?? '').not.toContain(',');
  });

  // `design-handoff.md` § Truncation — a Rejection Reason longer than about 21
  // characters truncates with an ellipsis in its column on desktop.
  // `truncate` on its own produced no ellipsis: it expands to
  // `overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap`, and
  // CSS ignores `overflow` on a non-replaced **inline** box, so a long Reason ran
  // out of its column instead. The block the ellipsis needs is asserted with it.
  it('truncates a Reason wording past about twenty-one characters', () => {
    const table = drawPanel(fullPanel);

    const wording = within(table).getByText(LONG_REASON);
    expect(wording.outerHTML).toMatch(/truncate|ellipsis/u);
    expect(wording.className).toMatch(/\bblock\b/u);
  });

  // `design-handoff.md` § Grid geometry — grid 639 = row 1 **355** + gap 16 +
  // row 2 268, and § Responsive behavior requires no scrolling at 1280 x 800.
  // This Panel drew 65 px rows against the design's 26 and, with Coverage Gap
  // beside it, put 272 px of scroll on the document.
  it('declares a list ceiling that keeps the Panel inside its row-1 budget', () => {
    const { container } = render(
      <ReasonConcentrationPanel panel={panelOf(EIGHT_ROWS)} />,
    );
    const region = listRegionOf(container);

    // Nothing is drawn above this Panel's list, so the whole of what row 1
    // leaves after the Card chrome is the list's.
    expect(region.style.maxHeight).toBe(
      `${REASON_CONCENTRATION_LIST_HEIGHT_PX}px`,
    );
    expect(REASON_CONCENTRATION_LIST_HEIGHT_PX + PANEL_CARD_CHROME_PX).toBe(
      ROW_ONE_PANEL_HEIGHT_PX,
    );

    // Eight rows at the design's own 26 px, header row included, sit inside it.
    expect(rowHeightOf(region)).toBe(PANEL_ROW_MAX_HEIGHT_PX);
    expect(
      PANEL_LIST_HEADER_HEIGHT_PX + EIGHT_ROWS * rowHeightOf(region),
    ).toBeLessThanOrEqual(REASON_CONCENTRATION_LIST_HEIGHT_PX);
  });

  // `design-handoff.md` § Responsive behavior → "Row-count pressure", ruled at
  // the `tasks` gate 2026-09-21: **list rows flex between 20 px and 26 px; below
  // 20 px the Panel scrolls internally while the surface does not.** Three row
  // counts, because one cannot tell a rule from a constant.
  it('flexes a row between twenty and twenty-six pixels and never outside them', () => {
    const roomy = listRegionOf(
      render(<ReasonConcentrationPanel panel={panelOf(EIGHT_ROWS)} />)
        .container,
    );
    const measured = listRegionOf(
      render(<ReasonConcentrationPanel panel={fullPanel} />).container,
    );
    const crowded = listRegionOf(
      render(<ReasonConcentrationPanel panel={panelOf(26)} />).container,
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

  // The second half of the rule: past the floor the **Panel** scrolls, not the
  // surface. The ceiling does not move with the row count.
  it('scrolls the Panel internally rather than the surface once the floor is reached', () => {
    const crowded = listRegionOf(
      render(<ReasonConcentrationPanel panel={panelOf(26)} />).container,
    );

    expect(crowded.style.maxHeight).toBe(
      `${REASON_CONCENTRATION_LIST_HEIGHT_PX}px`,
    );
    expect(crowded.className).toMatch(/\boverflow-y-auto\b/u);
    expect(
      PANEL_LIST_HEADER_HEIGHT_PX + 26 * rowHeightOf(crowded),
    ).toBeGreaterThan(REASON_CONCENTRATION_LIST_HEIGHT_PX);
  });

  // A column **head** may not be clipped — only a datum may truncate
  // (`design-handoff.md` § Truncation). `.table__column` spends 32 px of a
  // column's width on `px-4`, which is what left "Cum." as "Cu" in a 32 px
  // column and "Undecided" as "Undecid". Each head keeps the design's 6 px gap
  // as side padding and may wrap onto the header row's second budgeted line.
  it('leaves every column head room to wrap rather than slicing it', () => {
    const table = drawPanel(fullPanel);
    const heads = within(table).getAllByRole('columnheader');

    expect(heads).toHaveLength(5);

    for (const head of heads) {
      expect(head.className).toMatch(/\bpx-1\b/u);
      expect(head.className).toMatch(/\bwhitespace-normal\b/u);
      expect(head.className).not.toMatch(/\btruncate\b/u);
    }

    // The five columns sum to the Panel's own inner width rather than past the
    // card, so nothing overflows horizontally at desktop width; below it the
    // table keeps its widths and `Table.ScrollContainer` scrolls.
    expect(table.className).toMatch(/min-w-\[456px\]/u);
  });

  // The refused figure sat **below** its bar rather than beside it: an
  // `inline-flex` 88 px track followed by the figure is one inline formatting
  // context, so the figure wrapped the moment the cell was narrower than the two
  // together — and that wrap is what made a 26 px row 65 px tall. A flex row
  // with a growing track and a `flex-none` figure cannot wrap at any width.
  it('keeps the refused figure beside its bar on one line', () => {
    const table = drawPanel(fullPanel);
    const cell = within(table).getByText(`2${NBSP}980`, {
      normalizer: verbatim,
    }).parentElement;

    expect(cell).not.toBeNull();
    expect(cell?.className).toMatch(/\bflex\b/u);
    expect(cell?.className).toMatch(/\bwhitespace-nowrap\b/u);

    const track = cell?.querySelector<HTMLElement>('[style*="--chart-track"]');
    expect(track?.className).toMatch(/\bflex-1\b/u);
    expect(track?.className).not.toMatch(/\binline-flex\b/u);
    expect(track?.className).not.toMatch(/(?<![a-z-])w-(?:\[|\d)/u);
  });

  // `design-handoff.md` § Responsive behavior — the mobile treatment is the
  // same row on three lines, not a second copy of the Panel hidden at the other
  // width. A duplicated tree would read every figure to a screen reader twice.
  it('prints each figure once, so the mobile treatment is a reflow rather than a second tree', () => {
    drawPanel(fullPanel);

    expect(
      screen.getAllByText(`1${NBSP}220`, { normalizer: verbatim }),
    ).toHaveLength(1);
    expect(screen.getAllByText('810', { normalizer: verbatim })).toHaveLength(
      1,
    );
  });

  // `design-handoff.md` § Accessibility — nothing on the surface is
  // interactive, and no status colour appears, because nothing here judges the
  // Warehouse.
  // The tabindex count this case asserted was zero until the rows were handed
  // to HeroUI's `Table`, whose React Aria collection gives them roving grid
  // navigation — a cost
  // `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
  // § Consequences records and a system ADR that outranks
  // `design-handoff.md` § Accessibility's "takes no focus". What the case
  // guards is restated rather than dropped: the Panel offers no control to
  // activate, and nothing focusable sits outside the grid.
  it('offers no control to activate and wears no status colour', () => {
    const { container } = render(
      <ReasonConcentrationPanel panel={fullPanel} />,
    );

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
describe('ReasonConcentrationPanel column geometry', () => {
  // The three numeric columns were widened on request, and the running-share
  // column was two pixels from a defect while it was not: 40 px is a 32 px
  // content box, against a `100%` that measures 34. Asserted as declarations —
  // the table is `table-fixed`, so a declared width is the column's width.
  it('declares the widened numeric columns and gives the running share room for a hundred per cent', () => {
    const table = drawPanel(fullPanel);
    const [reason, refused, undecided, byCustomer, cumulative] =
      within(table).getAllByRole('columnheader');

    // The bar cell funds the widening: 130 → 92, so the Reason column pays
    // nothing for it. The track is `flex-1` beside a `flex-none` figure, so it
    // is what absorbs the cut — and the figure it yields to is why the track's
    // width carries no reading in the first place.
    expect(declaredWidthPx(refused)).toBe(92);

    expect(declaredWidthPx(undecided)).toBe(80);
    expect(declaredWidthPx(byCustomer)).toBe(88);

    const cumulativeWidth = declaredWidthPx(cumulative) ?? 0;
    expect(cumulativeWidth).toBe(48);
    expect(cumulativeWidth - COLUMN_SIDE_PADDING_PX).toBeGreaterThan(
      WIDEST_SHARE_FIGURE_PX,
    );

    // The Reason column declares none, which is what makes it the one that
    // absorbs the remainder.
    expect(declaredWidthPx(reason)).toBeNull();
  });

  // No horizontal overflow at the narrowest width the shell gives this table,
  // which is the rail-expanded 490 rather than the collapsed 574. The table is
  // `table-fixed` at `w-full`, so it is exactly as wide as its container down
  // to the 456 px floor it declares; below that `Table.ScrollContainer` scrolls
  // rather than compressing a head. Nothing overflows at 490 unless the fixed
  // columns alone exceed it — which is the regression that put a 513 px table
  // in a 490 px card and cut "Cum." to "Cu".
  it('seats every fixed column inside the rail-expanded width and leaves the Reason column the rest', () => {
    const table = drawPanel(fullPanel);
    const heads = within(table).getAllByRole('columnheader');

    const fixed = heads
      .map(declaredWidthPx)
      .filter((width): width is number => width !== null);

    // Four of the five declare a width; the fifth is Reason, asserted above.
    expect(fixed).toHaveLength(heads.length - 1);

    const fixedTotal = totalOf(fixed);
    expect(fixedTotal).toBe(308);
    expect(fixedTotal).toBeLessThan(RAIL_EXPANDED_TABLE_WIDTH_PX);

    // What is left for Reason at each width. The floor is where the wordings
    // are judged, because it is the narrowest the column is ever drawn.
    expect(RAIL_EXPANDED_TABLE_WIDTH_PX - fixedTotal).toBe(182);
    expect(PANEL_INNER_WIDTH_PX - fixedTotal).toBe(REASON_COLUMN_FLOOR_PX);

    // And the floor seats every wording § Truncation expects to fit. It did not
    // when the widening came out of this column instead: at 110 the content box
    // was 102 and seven of this Warehouse's eight Reasons truncated.
    expect(REASON_COLUMN_FLOOR_PX - COLUMN_SIDE_PADDING_PX).toBeGreaterThan(
      WIDEST_UNTRUNCATED_REASON_PX,
    );

    expect(table.className).toMatch(/\btable-fixed\b/u);
    expect(table.className).toMatch(/min-w-\[456px\]/u);
  });

  // Every measure head is centred over its column; the figures beneath stay
  // right-aligned, because a `tabular-nums` quantity is read down the column
  // against a shared right edge and centring would break that comparison.
  //
  // The two survive together only because alignment is declared in two places:
  // on the `Table.Column`, which is the `<th>` alone, and on the span inside
  // each `Table.Cell`. A rule moved onto the shared cell class would take both.
  it('centres each measure head while its figures stay right-aligned', () => {
    const table = drawPanel(fullPanel);
    const [reason, ...measures] = within(table).getAllByRole('columnheader');

    expect(measures).toHaveLength(4);

    for (const head of measures) {
      expect(head.className).toMatch(/\btext-center\b/u);
      expect(head.className).not.toMatch(/\btext-(?:right|left|start)\b/u);
    }

    // The row header keeps its own alignment: centring "Reason" would pull it
    // off the left-aligned wordings beneath it.
    expect(reason.className).not.toMatch(/\btext-center\b/u);

    const damaged = rowFor(table, 'Damaged in transit');

    for (const figure of ['640', '810', '40%']) {
      const printed = within(damaged).getByText(figure, {
        normalizer: verbatim,
      });

      expect(printed.className).toMatch(/\btext-right\b/u);
      expect(printed.className).toMatch(/\btabular-nums\b/u);
    }
  });
});
