import type { ReactElement } from 'react';
import { linearScale } from 'shared/utils/chart-scale';

export type ColumnPlotSeries = {
  id: string;
  /** Stated by the caller's `ChartLegend`, not repeated here. */
  label: string;
  colorVar: string;
};

export type ColumnPlotBucket = {
  id: string;
  /** One entry per series id present in this bucket; a series absent from a
   * bucket draws no column for it rather than a zero-height one standing in
   * for absence. */
  values: Record<string, number>;
};

type ColumnPlotProps = {
  series: ColumnPlotSeries[];
  buckets: ColumnPlotBucket[];
  /** The Panel's own fixed gridlines, e.g. `[0, 1250, 2500]`
   * (design-handoff.md § Panel specifications — Arrival Timing). */
  gridlineValues: number[];
  maxValue: number;
};

const PLOT_HEIGHT_PX = 116;

/**
 * Grouped columns over a shared linear scale: one bar per series, per
 * bucket, plus the Panel's own fixed gridlines drawn as solid 1px hairlines
 * (design-handoff.md § Type and mark specs — "never dashed"). No tooltip
 * ships and nothing here takes focus (ruled at the tasks gate 2026-09-21).
 */
export const ColumnPlot = ({
  series,
  buckets,
  gridlineValues,
  maxValue,
}: ColumnPlotProps): ReactElement => (
  <div>
    <div className="relative" style={{ height: PLOT_HEIGHT_PX }}>
      <div aria-hidden="true" className="absolute inset-0">
        {gridlineValues.map((value) => (
          <div
            key={value}
            data-testid="chart-gridline"
            className="absolute inset-x-0 border-t"
            style={{
              borderColor: 'var(--chart-grid)',
              bottom: linearScale(value, maxValue, PLOT_HEIGHT_PX),
            }}
          />
        ))}
      </div>
      <div className="relative flex h-full items-end gap-2">
        {buckets.map((bucket) => (
          <div
            key={bucket.id}
            className="flex flex-1 items-end justify-center gap-0.5"
          >
            {series.map((oneSeries) => (
              <div
                key={oneSeries.id}
                className="w-[17px] rounded-t-[3px]"
                style={{
                  height: linearScale(
                    bucket.values[oneSeries.id] ?? 0,
                    maxValue,
                    PLOT_HEIGHT_PX,
                  ),
                  backgroundColor: `var(${oneSeries.colorVar})`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  </div>
);
