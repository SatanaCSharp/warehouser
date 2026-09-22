import type { DemandPressurePanel as DemandPressurePanelBody } from '@warehouser/contracts/dashboards';
import { DEMAND_PRESSURE_SERIES } from 'modules/workspace/dashboard/utils/demand-pressure-series';
import type { ReactElement } from 'react';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';
import { linearScale } from 'shared/utils/chart-scale';

/**
 * One Warehouse's pressure bar, and the three band figures printed beneath it.
 *
 * A component rather than an expression in the cell: the figures are formatted
 * by `useLocaleFormat`, and React Aria caches a row's element tree per record,
 * so a renderer closing over that formatter would keep the old locale's
 * grouping for the life of the surface
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
 * §Decision 2).
 *
 * The marks are `aria-hidden` because the figures beneath state the same three
 * values — removing colour loses nothing (`design-handoff.md`
 * § Accessibility, "Never colour alone").
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
): { colorVar: string; id: string; value: number }[] => [
  { ...DEMAND_PRESSURE_SERIES[0], value: warehouse.overdueQuantity },
  { ...DEMAND_PRESSURE_SERIES[1], value: warehouse.dueSoonQuantity },
  { ...DEMAND_PRESSURE_SERIES[2], value: warehouse.laterQuantity },
];

type DemandPressureBarProps = {
  /**
   * The largest outstanding quantity across every Warehouse on the Panel — a
   * scale of quantities, not of shares (AC-14), so a small Warehouse in
   * trouble is not stretched to the same track length as a large healthy one.
   */
  domainMax: number;
  warehouse: DemandPressureWarehouse;
};

export const DemandPressureBar = ({
  domainMax,
  warehouse,
}: DemandPressureBarProps): ReactElement => {
  const { quantity } = useLocaleFormat();
  const segments = segmentsFor(warehouse);

  return (
    <>
      <span
        className="flex h-2.5 w-full items-stretch overflow-hidden rounded-[3px]"
        style={{ backgroundColor: 'var(--chart-track)' }}
      >
        {segments.map(({ colorVar, id, value }) => (
          <span
            aria-hidden="true"
            className="h-full"
            key={id}
            style={{
              backgroundColor: `var(${colorVar})`,
              width: `${linearScale(value, domainMax, FULL_TRACK)}%`,
            }}
          />
        ))}
      </span>
      <span className="mt-0.5 flex gap-2 text-[10px] text-muted tabular-nums">
        {segments.map(({ id, value }) => (
          <span key={id}>{quantity(value)}</span>
        ))}
      </span>
    </>
  );
};
