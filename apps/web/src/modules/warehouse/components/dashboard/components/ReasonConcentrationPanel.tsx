import type { ReasonConcentrationPanel as ReasonConcentrationPanelBody } from '@warehouser/contracts/dashboards';
import compact from 'lodash/compact';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelCard } from 'shared/components/charts/PanelCard';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';
import { linearScale } from 'shared/utils/chart-scale';

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
 * **Why this is a real `<table>` and not HeroUI's `Table`.**
 * `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md` requires
 * HeroUI's `Table` of a **data table** — a collection of records a member
 * browses, expands and sorts. This is not one: nothing here is interactive,
 * there is no disclosure, no nesting and no expansion. It is the accessible
 * substrate of a chart, which
 * `docs/features/dashboards/adr/0002-charting-without-a-charting-dependency.md`
 * (Accepted, later and narrower, § Consequences) decided for exactly these
 * row-oriented Panels.
 *
 * The sharper reason is in the system ADR's own § Consequences: an expandable
 * `Table` exposes `role="treegrid"`. This Panel's accessibility contract is
 * that "a screen reader announces the Reason with each figure", which wants
 * plain data-table semantics — `columnheader` and `rowheader` — not a tree the
 * reader cannot navigate. All three of that ADR's operative rules are inert
 * here: nothing nests in a `Table.Collection`, no per-row render cache can
 * stale a literal figure, and there is no `renderEmptyState` to supply because
 * `design-handoff.md` § States gives the Panel no empty state — with no rows
 * it draws its frame and its header row with no marks.
 */

/**
 * The scale's range. The frame draws the track at 88 px inside a 130 px bar
 * cell and narrower at 390, so a mark is measured onto the track's own width
 * rather than onto a pixel count that would overflow it at the other viewport.
 */
const FULL_TRACK = 100;

/** One drawn row: the ten Reasons, then the Remainder Row when there is one. */
type ReasonConcentrationLine = {
  customerReportedQuantity: number;
  id: string;
  label: string;
  /** The Remainder Row is muted and states how many Reasons it holds. */
  muted: boolean;
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
  const { quantity } = useLocaleFormat();

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
      muted: false,
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
          label: t('panels.reasonConcentration.remainder', {
            count: remainder.reasonCount,
          }),
          muted: true,
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
      <table
        aria-label={t('panels.reasonConcentration.title')}
        className="mt-2 w-full table-fixed text-xs"
      >
        <thead>
          <tr className="h-[18px] font-medium text-muted">
            <th className="text-left" scope="col">
              {t('panels.reasonConcentration.columns.reason')}
            </th>
            <th className="w-24 text-left sm:w-[130px]" scope="col">
              {t('panels.reasonConcentration.columns.refused')}
            </th>
            <th className="w-12 text-right sm:w-16" scope="col">
              {t('panels.reasonConcentration.columns.undecided')}
            </th>
            <th className="w-12 text-right sm:w-20" scope="col">
              {t('panels.reasonConcentration.columns.byCustomer')}
            </th>
            <th className="w-8 text-right" scope="col">
              {t('panels.reasonConcentration.columns.cumulative')}
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr className="h-[26px]" key={line.id}>
              <th
                className={`truncate text-left ${line.muted ? 'font-medium text-muted' : 'font-normal text-foreground'}`}
                scope="row"
              >
                {line.label}
              </th>
              <td className="font-semibold tabular-nums text-foreground">
                <span
                  className="mr-1.5 inline-flex h-2.5 w-10 align-middle sm:w-[88px]"
                  style={{ backgroundColor: 'var(--chart-track)' }}
                >
                  <span
                    aria-hidden="true"
                    className="h-full rounded-r-[3px]"
                    style={{
                      backgroundColor: 'var(--chart-ramp-3b)',
                      width: `${linearScale(line.refusedQuantity, domainMax, FULL_TRACK)}%`,
                    }}
                  />
                </span>
                {quantity(line.refusedQuantity)}
              </td>
              <td className="text-right tabular-nums text-muted">
                {quantity(line.undecidedQuantity)}
              </td>
              <td className="text-right tabular-nums text-muted">
                {quantity(line.customerReportedQuantity)}
              </td>
              <td className="text-right tabular-nums text-muted">
                {line.share}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelCard>
  );
};
