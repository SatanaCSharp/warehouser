import { render, screen, within } from '@testing-library/react';
import type { ReasonConcentrationPanel as ReasonConcentrationPanelBody } from '@warehouser/contracts/dashboards';
import { ReasonConcentrationPanel } from 'modules/warehouse/components/dashboard/ReasonConcentrationPanel';
import { QUANTITY_GROUP_SEPARATOR } from 'shared/utils/number-format';
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
// A real `<table>` rather than HeroUI's `Table`, for the reason recorded in
// `CoverageGapPanel.spec.tsx`: this is the accessible substrate of a chart, not
// a data table, and
// `docs/features/dashboards/adr/0002-charting-without-a-charting-dependency.md`
// (Accepted) decided it for exactly these Panels.

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

  return screen.getByRole('table');
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
    expect(within(header).queryAllByRole('cell')).toStrictEqual([]);
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
  it('truncates a Reason wording past about twenty-one characters', () => {
    const table = drawPanel(fullPanel);

    const wording = within(table).getByText(LONG_REASON);
    expect(wording.outerHTML).toMatch(/truncate|ellipsis/u);
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
  it('offers nothing to focus and wears no status colour', () => {
    const { container } = render(
      <ReasonConcentrationPanel panel={fullPanel} />,
    );

    expect(screen.queryAllByRole('button')).toStrictEqual([]);
    expect(screen.queryAllByRole('link')).toStrictEqual([]);
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/--danger|--warning|--success/u);
  });
});
