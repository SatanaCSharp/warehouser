import { Table } from '@heroui/react';
import type { DemandPressurePanel as DemandPressurePanelBody } from '@warehouser/contracts/dashboards';
import { DemandPressureBar } from 'modules/workspace/dashboard/components/components/demand-pressure-panel/components/DemandPressureBar';
import { DemandPressureOutstanding } from 'modules/workspace/dashboard/components/components/demand-pressure-panel/components/DemandPressureOutstanding';
import { DEMAND_PRESSURE_SERIES } from 'modules/workspace/dashboard/utils/demand-pressure-series';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartLegendItem } from 'shared/components/charts/ChartLegend';
import { ChartLegend } from 'shared/components/charts/ChartLegend';
import { PanelCard } from 'shared/components/charts/PanelCard';
import { PanelFootnote } from 'shared/components/charts/PanelFootnote';

/**
 * T20 — the Demand Pressure Panel (AC-14; `design-handoff.md` § Panel
 * specifications, frame `DCucv`).
 *
 * The collection of records this Panel presents is drawn with HeroUI's
 * `Table`, per
 * `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md` §Decision:
 * a feature file assembles no `<table>` markup of its own. Its cells render
 * components because a row's element tree is cached per record and the
 * figures are locale-formatted (§Decision 2), and the ARIA role becomes
 * `grid`/`rowheader`/`gridcell`, which that ADR records as an accepted cost.
 *
 * **Why this cannot take a shared stacked-row primitive, as T19's provisional
 * grid did.** Such a primitive lays its segments out with
 * `flexGrow: segment.value` inside a *fixed-width* track — every row's
 * segments always sum to that same width, so every Warehouse's bar fills the
 * same length regardless of how much it actually has outstanding. That is
 * exactly the "scale of shares" AC-14 forbids: it flattens a small Warehouse
 * in trouble to the same bar length as a large healthy one. This Panel scales
 * every row against **one shared quantity domain** instead, which
 * `DemandPressureBar` computes with `shared/utils/chart-scale.ts`'s
 * `linearScale` (ADR 0002).
 */

type DemandPressurePanelProps = {
  panel: DemandPressurePanelBody;
};

export const DemandPressurePanel = ({
  panel,
}: DemandPressurePanelProps): ReactElement => {
  const { t } = useTranslation('dashboard');

  // Ordinal steps 1-3, dark to light: Overdue, Due soon, Later. Every band is
  // named in the legend and every figure is printed beside the bar, so
  // removing colour entirely loses nothing (`design-handoff.md`
  // § Accessibility, "Never colour alone"). Nothing here judges a Warehouse,
  // so no status colour is used.
  const legend: ChartLegendItem[] = DEMAND_PRESSURE_SERIES.map((series) => ({
    id: series.id,
    label: t(`panels.demandPressure.bands.${series.id}`),
    colorVar: series.colorVar,
  }));

  // Every bar is measured against the largest outstanding quantity across
  // every Warehouse on the Panel — a scale of quantities, not of shares
  // (AC-14) — so a small Warehouse in trouble is not stretched to the same
  // track length as a large healthy one.
  const domainMax = Math.max(
    0,
    ...panel.warehouses.map((warehouse) => warehouse.totalOutstandingQuantity),
  );

  return (
    <PanelCard
      title={t('panels.demandPressure.title')}
      meta={t('panels.demandPressure.meta')}
    >
      <ChartLegend items={legend} />
      <Table className="mt-2" variant="secondary">
        <Table.ScrollContainer>
          <Table.Content
            aria-label={t('panels.demandPressure.title')}
            className="w-full table-fixed text-xs"
          >
            <Table.Header>
              <Table.Column className="w-20 text-left sm:w-[116px]" isRowHeader>
                {t('panels.demandPressure.columns.warehouse')}
              </Table.Column>
              <Table.Column className="sm:w-[248px]">
                {/* The frame draws no head over the bar; a screen reader still
                    needs the column named. */}
                <span className="sr-only">
                  {t('panels.demandPressure.columns.pressure')}
                </span>
              </Table.Column>
              <Table.Column className="w-14 text-right sm:w-[76px]">
                {t('panels.demandPressure.columns.outstanding')}
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {panel.warehouses.map((warehouse) => (
                <Table.Row
                  id={warehouse.warehouseId}
                  key={warehouse.warehouseId}
                >
                  <Table.Cell>
                    <span className="truncate font-normal text-foreground">
                      {warehouse.warehouseName}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <DemandPressureBar
                      domainMax={domainMax}
                      warehouse={warehouse}
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <DemandPressureOutstanding
                      value={warehouse.totalOutstandingQuantity}
                    />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      <PanelFootnote>
        {t('panels.demandPressure.footnote', {
          count: panel.archivedWarehouseCount,
        })}
      </PanelFootnote>
    </PanelCard>
  );
};
