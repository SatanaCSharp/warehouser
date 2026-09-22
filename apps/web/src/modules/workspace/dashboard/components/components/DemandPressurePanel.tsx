import type { DemandPressurePanel as DemandPressurePanelBody } from '@warehouser/contracts/dashboards';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartLegendItem } from 'shared/components/charts/ChartLegend';
import { ChartLegend } from 'shared/components/charts/ChartLegend';
import { PanelCard } from 'shared/components/charts/PanelCard';
import { PanelFootnote } from 'shared/components/charts/PanelFootnote';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';
import { linearScale } from 'shared/utils/chart-scale';

/**
 * T20 — the Demand Pressure Panel (AC-14; `design-handoff.md` § Panel
 * specifications, frame `DCucv`).
 *
 * **Why this is a real `<table>` and not HeroUI's `Table`.**
 * `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md` requires
 * HeroUI's `Table` of a **data table** a member browses, expands and sorts.
 * This Panel has none of that — it is the accessible substrate of a chart
 * (`docs/features/dashboards/adr/0002-charting-without-a-charting-dependency.md`,
 * Accepted, § Consequences), the same reasoning that already keeps
 * `CoverageGapPanel` and `ReasonConcentrationPanel` off `Table`.
 *
 * **Why this cannot take a shared stacked-row primitive, as T19's provisional
 * grid did.** Such a primitive lays its segments out with
 * `flexGrow: segment.value` inside a *fixed-width* track — every row's
 * segments always sum to that same width, so every Warehouse's bar fills the
 * same length regardless of how much it actually has outstanding. That is
 * exactly the "scale of shares" AC-14 forbids: it flattens a small Warehouse
 * in trouble to the same bar length as a large healthy one. This Panel scales
 * every row against **one shared quantity domain** instead, the way
 * `CoverageGapPanel` already does with `shared/utils/chart-scale.ts`'s
 * `linearScale` (ADR 0002).
 */

/**
 * The scale's range. The frame draws the track at 248 px (Warehouse 116 ·
 * track 248 · Outstanding 76), so a mark is measured onto the track's own
 * width rather than onto a pixel count that would overflow it at the other
 * viewport.
 */
const FULL_TRACK = 100;

type DemandPressureWarehouse = DemandPressurePanelBody['warehouses'][number];

const segmentsFor = (
  warehouse: DemandPressureWarehouse,
  legend: ChartLegendItem[],
): { series: ChartLegendItem; value: number }[] => [
  { series: legend[0], value: warehouse.overdueQuantity },
  { series: legend[1], value: warehouse.dueSoonQuantity },
  { series: legend[2], value: warehouse.laterQuantity },
];

type DemandPressurePanelProps = {
  panel: DemandPressurePanelBody;
};

export const DemandPressurePanel = ({
  panel,
}: DemandPressurePanelProps): ReactElement => {
  const { t } = useTranslation('dashboard');
  const { quantity } = useLocaleFormat();

  // Ordinal steps 1-3, dark to light: Overdue, Due soon, Later. Every band is
  // named in the legend and every figure is printed beside the bar, so
  // removing colour entirely loses nothing (`design-handoff.md`
  // § Accessibility, "Never colour alone"). Nothing here judges a Warehouse,
  // so no status colour is used.
  const legend: ChartLegendItem[] = [
    {
      id: 'overdue',
      label: t('panels.demandPressure.bands.overdue'),
      colorVar: '--chart-ramp-3a',
    },
    {
      id: 'dueSoon',
      label: t('panels.demandPressure.bands.dueSoon'),
      colorVar: '--chart-ramp-3b',
    },
    {
      id: 'later',
      label: t('panels.demandPressure.bands.later'),
      colorVar: '--chart-ramp-3c',
    },
  ];

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
      <table
        aria-label={t('panels.demandPressure.title')}
        className="mt-2 w-full table-fixed text-xs"
      >
        <thead>
          <tr className="h-[18px] font-medium text-muted">
            <th className="w-20 text-left sm:w-[116px]" scope="col">
              {t('panels.demandPressure.columns.warehouse')}
            </th>
            <th className="sm:w-[248px]" scope="col">
              {/* The frame draws no head over the bar; a screen reader still
                  needs the column named. */}
              <span className="sr-only">
                {t('panels.demandPressure.columns.pressure')}
              </span>
            </th>
            <th className="w-14 text-right sm:w-[76px]" scope="col">
              {t('panels.demandPressure.columns.outstanding')}
            </th>
          </tr>
        </thead>
        <tbody>
          {panel.warehouses.map((warehouse) => (
            <tr className="h-[22px]" key={warehouse.warehouseId}>
              <th
                className="truncate text-left font-normal text-foreground"
                scope="row"
              >
                {warehouse.warehouseName}
              </th>
              <td>
                <span
                  className="flex h-2.5 w-full items-stretch overflow-hidden rounded-[3px]"
                  style={{ backgroundColor: 'var(--chart-track)' }}
                >
                  {segmentsFor(warehouse, legend).map(({ series, value }) => (
                    <span
                      aria-hidden="true"
                      className="h-full"
                      key={series.id}
                      style={{
                        backgroundColor: `var(${series.colorVar})`,
                        width: `${linearScale(value, domainMax, FULL_TRACK)}%`,
                      }}
                    />
                  ))}
                </span>
                <span className="mt-0.5 flex gap-2 text-[10px] text-muted tabular-nums">
                  {segmentsFor(warehouse, legend).map(({ series, value }) => (
                    <span key={series.id}>{quantity(value)}</span>
                  ))}
                </span>
              </td>
              <td className="text-right font-semibold tabular-nums text-foreground">
                {quantity(warehouse.totalOutstandingQuantity)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <PanelFootnote>
        {t('panels.demandPressure.footnote', {
          count: panel.archivedWarehouseCount,
        })}
      </PanelFootnote>
    </PanelCard>
  );
};
