import { Table } from '@heroui/react';
import type { ReasonConcentrationPanel as ReasonConcentrationPanelBody } from '@warehouser/contracts/dashboards';
import compact from 'lodash/compact';
import { ReasonConcentrationLabel } from 'modules/warehouse/components/dashboard/components/reason-concentration-panel/components/ReasonConcentrationLabel';
import { ReasonConcentrationQuantity } from 'modules/warehouse/components/dashboard/components/reason-concentration-panel/components/ReasonConcentrationQuantity';
import { ReasonConcentrationRefused } from 'modules/warehouse/components/dashboard/components/reason-concentration-panel/components/ReasonConcentrationRefused';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelCard } from 'shared/components/charts/PanelCard';

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
      <Table className="mt-2" variant="secondary">
        <Table.ScrollContainer>
          <Table.Content
            aria-label={t('panels.reasonConcentration.title')}
            className="w-full table-fixed text-xs"
          >
            <Table.Header>
              <Table.Column isRowHeader>
                {t('panels.reasonConcentration.columns.reason')}
              </Table.Column>
              <Table.Column className="w-24 text-left sm:w-[130px]">
                {t('panels.reasonConcentration.columns.refused')}
              </Table.Column>
              <Table.Column className="w-12 text-right sm:w-16">
                {t('panels.reasonConcentration.columns.undecided')}
              </Table.Column>
              <Table.Column className="w-12 text-right sm:w-20">
                {t('panels.reasonConcentration.columns.byCustomer')}
              </Table.Column>
              <Table.Column className="w-8 text-right">
                {t('panels.reasonConcentration.columns.cumulative')}
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {lines.map((line) => (
                <Table.Row id={line.id} key={line.id}>
                  <Table.Cell>
                    <ReasonConcentrationLabel
                      label={line.label}
                      reasonCount={line.reasonCount}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <ReasonConcentrationRefused
                      domainMax={domainMax}
                      refusedQuantity={line.refusedQuantity}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <ReasonConcentrationQuantity
                      className="block text-right tabular-nums text-muted"
                      value={line.undecidedQuantity}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <ReasonConcentrationQuantity
                      className="block text-right tabular-nums text-muted"
                      value={line.customerReportedQuantity}
                    />
                  </Table.Cell>
                  <Table.Cell>
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
