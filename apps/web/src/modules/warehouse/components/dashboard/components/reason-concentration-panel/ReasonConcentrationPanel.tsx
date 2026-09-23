import { Table } from '@heroui/react';
import type { ReasonConcentrationPanel as ReasonConcentrationPanelBody } from '@warehouser/contracts/dashboards';
import compact from 'lodash/compact';
import { ReasonConcentrationLabel } from 'modules/warehouse/components/dashboard/components/reason-concentration-panel/components/ReasonConcentrationLabel';
import { ReasonConcentrationQuantity } from 'modules/warehouse/components/dashboard/components/reason-concentration-panel/components/ReasonConcentrationQuantity';
import { ReasonConcentrationRefused } from 'modules/warehouse/components/dashboard/components/reason-concentration-panel/components/ReasonConcentrationRefused';
import { REASON_CONCENTRATION_LIST_HEIGHT_PX } from 'modules/warehouse/utils/panel-list-budget';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelCard } from 'shared/components/charts/PanelCard';
import {
  PANEL_LIST_CELL_CLASS,
  PANEL_LIST_COLUMN_CLASS,
  panelListStyle,
} from 'shared/utils/panel-list-density';

/**
 * T17 — the Reason Concentration Panel (AC-12; `design-handoff.md` § Panel
 * specifications, frame `CZvHc`).
 *
 * **Not a Pareto chart.** A quantity bar against a cumulative-% line is a
 * dual-axis plot, which invents a correlation the data does not contain, so
 * the running share AC-12 requires is a numeric column. Undecided and
 * By-customer are columns for a second reason: a Rejection can be both
 * undecided and customer-reported, so stacking them inside one bar would
 * double-count it. The bar carries the refused quantity alone.
 *
 * The collection of records this Panel presents is drawn with HeroUI's
 * `Table`, per
 * `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md` §Decision:
 * a feature file assembles no `<table>` markup of its own. The reason recorded
 * here before the `dashboards` conformance review — that the ADR reaches only
 * a table a member browses, expands and sorts — appears in no system document.
 *
 * Every cell renders a component, because React Aria caches a row's element
 * tree per record and these cells read `useLocaleFormat` and `useTranslation`
 * (§Decision 2). The ARIA role changes with the mechanism: `grid`,
 * `rowheader` and `gridcell`, which the ADR records as an accepted cost.
 *
 * ## Geometry
 *
 * The five columns are `design-handoff.md` § Panel specifications' own —
 * Reason 126 · bar cell 130 (track 88 + value 36) · Undecided 64 · By customer
 * 80 · Cum. 32, gap 6 — restated at the widths each **head** needs, so that a
 * datum may truncate (§ Truncation) but a head is never sliced: the gap is the
 * shared 4 px of side padding every list cell carries. The five previously
 * summed past the card — a 513 px table in a 490 px card — which cut "Cum." to
 * "Cu" and its figures off at the card edge.
 *
 * The three numeric columns were then widened on request, and one of them was
 * two pixels from a defect: at 40 px, "Cum." held a 32 px content box against a
 * `100%` that measures 34. They are **Undecided 80 · By customer 88 · Cum. 48**,
 * and the 40 px content box "Cum." now clears its widest figure by 6 px.
 *
 * That widening is paid for by the bar cell, not by the Reason column. Funding
 * it from Reason instead was tried and measured at the 456 px floor: the column
 * fell to 110, a 102 px content box, and **seven of this Warehouse's eight
 * Reasons truncated** — "Damaged in transit" (107), "Wrong item supplied"
 * (117), "Damaged by packing" (119), "Shelf life insufficient" (116), "Short
 * within packaging" (129), "Documentation missing" (133), "Packaging not as
 * instructed" (157). A Panel whose rows cannot be read is worse than one whose
 * bars are shorter, and the bar is the element that can afford it: the refused
 * quantity is printed immediately beside the track, so the track's width
 * carries no reading at all.
 *
 * So the bar cell goes 130 → **92**, and the fixed columns sum to
 * 92 + 80 + 88 + 48 = **308 px**. The Reason column is the only one with no
 * declared width, so it absorbs the remainder: **148 px at the 456 px floor
 * below, 182 px at the 490 px the shell leaves with its navigation rail
 * expanded, 266 px with the rail collapsed.** Its 140 px content box at the
 * floor seats every Reason above except "Packaging not as instructed", which
 * is 27 characters — past the ~21 § Truncation explicitly allows a Reason — and
 * is left to truncate with the ellipsis `ReasonConcentrationLabel`'s block
 * gives it. Reaching 157 would have cost another 24 px of track, which the
 * next paragraph does not have.
 *
 * **The track is `flex-1` beside a `flex-none` figure, so its width is
 * 92 − 8 px of cell padding − the 6 px gap − whatever the figure measures: 54 px
 * against the figures this Warehouse prints, and 42 px at the 36 px value the
 * frame budgets.** 42 is the floor, and it still reads: the smallest share this
 * Panel draws is a few per cent of the domain, which is a visible mark at that
 * width, and the exact quantity is printed beside it rather than estimated off
 * the track. What the cell may never do is shrink far enough to wrap that
 * figure below its bar — the wrap that made a 26 px row 65 px tall — and it
 * cannot, because `ReasonConcentrationRefused` is a flex row with a
 * `whitespace-nowrap` figure that the track yields to.
 *
 * Each measure head is centred over its column while its figures stay
 * `text-right`: the heads are labels being scanned across, the figures are
 * `tabular-nums` quantities being compared down, and only the second reading
 * needs a shared right edge. Alignment is declared on the `Table.Column`, which
 * is the `<th>` alone — the body cells take theirs from the span inside them —
 * so centring a head cannot reach the column's data. The Reason head is left
 * out of that: centring it would pull it off the left-aligned wordings beneath
 * it.
 *
 * Below 456 px the table keeps those widths and `Table.ScrollContainer` scrolls
 * horizontally, rather than compressing the columns until their heads are
 * sliced.
 *
 * Row density is `shared/utils/panel-list-density.ts` — the 20-26 px flex and
 * the internal scroll ruled at the `tasks` gate — over the budget
 * `modules/warehouse/utils/panel-list-budget.ts` derives for this surface. The 65 px rows this
 * Panel drew came from two causes together: `.table__cell`'s own `py-3 text-sm`,
 * and the refused figure wrapping below its bar, which
 * `ReasonConcentrationRefused` now makes impossible.
 *
 * § Responsive behavior's three-line mobile row is not drawn yet.
 */

/** One drawn row: the ten Reasons, then the Remainder Row when there is one. */
type ReasonConcentrationLine = {
  customerReportedQuantity: number;
  id: string;
  /** The Reason's own name; absent on the Remainder Row. */
  label?: string;
  /** Present only on the Remainder Row, which states how many Reasons it holds. */
  reasonCount?: number;
  refusedQuantity: number;
  /** The running share, which the Remainder Row does not carry. */
  share: string;
  undecidedQuantity: number;
};

type ReasonConcentrationPanelProps = {
  panel: ReasonConcentrationPanelBody;
};

export const ReasonConcentrationPanel = ({
  panel,
}: ReasonConcentrationPanelProps): ReactElement => {
  const { t } = useTranslation('dashboard');

  const { remainder } = panel;

  // The Remainder Row's figures exist only when the projection gathered one,
  // so it joins the sequence as a value rather than as a second branch in the
  // tree (`docs/system/guides/writing-web-conditional-components.md` §2). With
  // nothing gathered, no Remainder Row is drawn at all — not one of zeros
  // (AC-12).
  const lines: ReasonConcentrationLine[] = compact([
    ...panel.rows.map((row): ReasonConcentrationLine => ({
      customerReportedQuantity: row.customerReportedQuantity,
      id: row.rejectionReasonId,
      label: row.label,
      refusedQuantity: row.refusedQuantity,
      share: t('panels.reasonConcentration.cumulative', {
        share: Math.round(row.cumulativeSharePercent),
      }),
      undecidedQuantity: row.undecidedQuantity,
    })),
    remainder === null
      ? null
      : {
          customerReportedQuantity: remainder.customerReportedQuantity,
          id: 'remainder',
          reasonCount: remainder.reasonCount,
          refusedQuantity: remainder.refusedQuantity,
          share: '',
          undecidedQuantity: remainder.undecidedQuantity,
        },
  ]);

  // Every bar is measured against the largest refused quantity on the Panel,
  // so the bars compare with each other (ADR 0002 — one linear scale from zero
  // to a rounded maximum).
  const domainMax = Math.max(0, ...lines.map((line) => line.refusedQuantity));

  return (
    <PanelCard
      title={t('panels.reasonConcentration.title')}
      meta={t('panels.reasonConcentration.meta')}
    >
      <Table variant="secondary">
        <Table.ScrollContainer
          className="overflow-y-auto"
          style={panelListStyle(
            REASON_CONCENTRATION_LIST_HEIGHT_PX,
            lines.length,
          )}
        >
          <Table.Content
            aria-label={t('panels.reasonConcentration.title')}
            className="w-full min-w-[456px] table-fixed text-xs"
          >
            <Table.Header>
              <Table.Column className={PANEL_LIST_COLUMN_CLASS} isRowHeader>
                {t('panels.reasonConcentration.columns.reason')}
              </Table.Column>
              <Table.Column
                className={`${PANEL_LIST_COLUMN_CLASS} w-[92px] text-center`}
              >
                {t('panels.reasonConcentration.columns.refused')}
              </Table.Column>
              <Table.Column
                className={`${PANEL_LIST_COLUMN_CLASS} w-20 text-center`}
              >
                {t('panels.reasonConcentration.columns.undecided')}
              </Table.Column>
              <Table.Column
                className={`${PANEL_LIST_COLUMN_CLASS} w-[88px] text-center`}
              >
                {t('panels.reasonConcentration.columns.byCustomer')}
              </Table.Column>
              <Table.Column
                className={`${PANEL_LIST_COLUMN_CLASS} w-12 text-center`}
              >
                {t('panels.reasonConcentration.columns.cumulative')}
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {lines.map((line) => (
                <Table.Row id={line.id} key={line.id}>
                  <Table.Cell className={PANEL_LIST_CELL_CLASS}>
                    <ReasonConcentrationLabel
                      label={line.label}
                      reasonCount={line.reasonCount}
                    />
                  </Table.Cell>
                  <Table.Cell className={PANEL_LIST_CELL_CLASS}>
                    <ReasonConcentrationRefused
                      domainMax={domainMax}
                      refusedQuantity={line.refusedQuantity}
                    />
                  </Table.Cell>
                  <Table.Cell className={PANEL_LIST_CELL_CLASS}>
                    <ReasonConcentrationQuantity
                      className="block text-right tabular-nums text-muted"
                      value={line.undecidedQuantity}
                    />
                  </Table.Cell>
                  <Table.Cell className={PANEL_LIST_CELL_CLASS}>
                    <ReasonConcentrationQuantity
                      className="block text-right tabular-nums text-muted"
                      value={line.customerReportedQuantity}
                    />
                  </Table.Cell>
                  <Table.Cell className={PANEL_LIST_CELL_CLASS}>
                    <span className="block text-right tabular-nums text-muted">
                      {line.share}
                    </span>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </PanelCard>
  );
};
