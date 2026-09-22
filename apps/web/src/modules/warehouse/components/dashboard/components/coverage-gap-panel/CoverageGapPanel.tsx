import { Table } from '@heroui/react';
import type { CoverageGapPanel as CoverageGapPanelBody } from '@warehouser/contracts/dashboards';
import compact from 'lodash/compact';
import { CoverageGapBar } from 'modules/warehouse/components/dashboard/components/coverage-gap-panel/components/CoverageGapBar';
import { CoverageGapItemLabel } from 'modules/warehouse/components/dashboard/components/coverage-gap-panel/components/CoverageGapItemLabel';
import { CoverageGapQuantity } from 'modules/warehouse/components/dashboard/components/coverage-gap-panel/components/CoverageGapQuantity';
import type { CoverageGapQuantities } from 'modules/warehouse/utils/coverage-gap-series';
import { COVERAGE_GAP_SERIES } from 'modules/warehouse/utils/coverage-gap-series';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartLegendItem } from 'shared/components/charts/ChartLegend';
import { ChartLegend } from 'shared/components/charts/ChartLegend';
import { PanelCard } from 'shared/components/charts/PanelCard';

/**
 * T17 — the Coverage Gap Panel (AC-03, AC-05, AC-25; `design-handoff.md`
 * § Panel specifications, frame `Z4cE3M`).
 *
 * The collection of records this Panel presents is drawn with HeroUI's
 * `Table`, per `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
 * §Decision: "A feature file does not assemble `<table>`, `<thead>`,
 * `<tbody>`, `<tr>` or `<td>` markup of its own." It did until the
 * `dashboards` front-end conformance review; the reason recorded here — that
 * the ADR reaches only a table a member "browses, expands and sorts" — appears
 * in no system document, and the ADR converted `ItemDirectory`, a flat
 * six-column table with no disclosure, on the same terms.
 *
 * Two consequences of the collection model shape this file, and both are the
 * ADR's §Decision 2 rather than incidental:
 *
 * - **Every cell renders a component, never an expression.** React Aria builds
 *   a row's element tree before the DOM and caches it per record, so a value
 *   the renderer closed over stays whatever it was at first build. That is not
 *   hypothetical here: the figures are formatted by `useLocaleFormat`, so a
 *   row closing over its `quantity` would keep the old locale's grouping for
 *   the life of the surface. `CoverageGapQuantity`, `CoverageGapItemLabel` and
 *   `CoverageGapBar` each read what they need themselves.
 * - **The ARIA role changes**, which the ADR records as an accepted cost: a
 *   React Aria table exposes `role="grid"` with `rowheader` and `gridcell`,
 *   not `table`/`cell`. `design-handoff.md` § Accessibility asks that "a
 *   screen reader announces the Item with each figure", which the row header
 *   still does.
 *
 * The Panel has no empty state: `design-handoff.md` § States gives it none, so
 * with no rows it draws its frame, its legend and its header row with no
 * marks, and `renderEmptyState` is deliberately absent.
 */

/** One drawn row: the ten Items, then the Remainder Row when there is one. */
type CoverageGapLine = {
  id: string;
  /** Present only on the Remainder Row, which states how many Items it holds. */
  itemCount?: number;
  quantities: CoverageGapQuantities;
  sku?: string;
  total: number;
};

type CoverageGapPanelProps = {
  panel: CoverageGapPanelBody;
};

export const CoverageGapPanel = ({
  panel,
}: CoverageGapPanelProps): ReactElement => {
  const { t } = useTranslation('dashboard');

  // Ordinal steps 1–3, dark to light. The legend states all three as text and
  // every quantity is printed in its own column, so removing colour entirely
  // loses no figure (`design-handoff.md` § Accessibility, "Never colour
  // alone"). The ids come from `CoverageGapBar`, so the legend and the marks
  // cannot drift apart.
  const legend: ChartLegendItem[] = COVERAGE_GAP_SERIES.map((series) => ({
    id: series.id,
    label: t(`panels.coverageGap.series.${series.id}`),
    colorVar: series.colorVar,
  }));

  const { remainder } = panel;

  // The Remainder Row's figures exist only when the projection gathered one,
  // so it joins the sequence as a value rather than as a second branch in the
  // tree (`docs/system/guides/writing-web-conditional-components.md` §2).
  const lines: CoverageGapLine[] = compact([
    ...panel.rows.map((row): CoverageGapLine => ({
      id: row.itemId,
      sku: row.sku,
      quantities: row,
      total: row.totalOutstandingQuantity,
    })),
    remainder === null
      ? null
      : {
          id: 'remainder',
          itemCount: remainder.itemCount,
          quantities: remainder,
          total: remainder.totalOutstandingQuantity,
        },
  ]);

  // Every row is measured against the largest outstanding quantity on the
  // Panel, so the bars compare with each other rather than each filling its
  // own track (ADR 0002 — one linear scale from zero to a rounded maximum).
  const domainMax = Math.max(0, ...lines.map((line) => line.total));

  return (
    <PanelCard
      title={t('panels.coverageGap.title')}
      meta={t('panels.coverageGap.meta')}
    >
      <ChartLegend items={legend} />
      <Table className="mt-2" variant="secondary">
        <Table.ScrollContainer>
          <Table.Content
            aria-label={t('panels.coverageGap.title')}
            className="w-full table-fixed text-xs"
          >
            <Table.Header>
              <Table.Column isRowHeader>
                {t('panels.coverageGap.columns.item')}
              </Table.Column>
              <Table.Column className="w-16 sm:w-[150px]">
                {/* The frame draws no head over the bar; a screen reader still
                    needs the column named. */}
                <span className="sr-only">
                  {t('panels.coverageGap.columns.coverage')}
                </span>
              </Table.Column>
              <Table.Column className="w-9 text-right sm:w-11">
                {t('panels.coverageGap.columns.onHand')}
              </Table.Column>
              <Table.Column className="w-9 text-right sm:w-11">
                {t('panels.coverageGap.columns.onOrder')}
              </Table.Column>
              <Table.Column className="w-10 text-right sm:w-[70px]">
                {t('panels.coverageGap.columns.uncovered')}
              </Table.Column>
              <Table.Column className="w-11 text-right sm:w-14">
                {t('panels.coverageGap.columns.total')}
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {lines.map((line) => (
                <Table.Row id={line.id} key={line.id}>
                  <Table.Cell>
                    <CoverageGapItemLabel
                      itemCount={line.itemCount}
                      sku={line.sku}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <CoverageGapBar
                      domainMax={domainMax}
                      quantities={line.quantities}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <CoverageGapQuantity
                      className="block text-right tabular-nums text-foreground"
                      value={line.quantities.onHandQuantity}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <CoverageGapQuantity
                      className="block text-right tabular-nums text-foreground"
                      value={line.quantities.inboundQuantity}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <CoverageGapQuantity
                      className="block text-right font-semibold tabular-nums text-foreground"
                      value={line.quantities.uncoveredQuantity}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <CoverageGapQuantity
                      className="block text-right tabular-nums text-muted"
                      value={line.total}
                    />
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
