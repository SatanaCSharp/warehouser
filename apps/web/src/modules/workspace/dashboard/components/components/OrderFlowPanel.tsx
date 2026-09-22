import type { OrderFlowPanel as OrderFlowPanelBody } from '@warehouser/contracts/dashboards';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartLegendItem } from 'shared/components/charts/ChartLegend';
import { ChartLegend } from 'shared/components/charts/ChartLegend';
import { PanelCard } from 'shared/components/charts/PanelCard';
import { PanelFootnote } from 'shared/components/charts/PanelFootnote';
import { linearScale } from 'shared/utils/chart-scale';
import { isoWeekNumber } from 'shared/utils/iso-week-number';

/**
 * T21 — the Order Flow Panel (AC-16, AC-17a; `design-handoff.md` § Panel
 * specifications, frame `z5olfa`).
 *
 * Twelve stacked columns, pooled across the Workspace and **naming no
 * Warehouse anywhere on the Panel** (AC-16). A grouped-column primitive
 * carries no per-segment `data-quantity`, so it cannot express this Panel's
 * bottom-up stack —
 * Assigned to arrived goods → Still awaited → Cancelled, the cancelled part
 * reading as withdrawn from the week rather than as demand outstanding — and
 * this file draws its own columns directly over `shared/utils/chart-scale`'s
 * `linearScale` instead of composing one.
 *
 * The `role="img"` wrapper around the plot carries AC-17a's disclosure as its
 * accessible summary, read from the exact same translated string the
 * footnote prints below it, so the two can never drift
 * (`design-handoff.md` § Accessibility, "Structure").
 */

/** Order Flow's own column width: 14px below the breakpoint, 18px above it
 * (`design-handoff.md` § Type and mark specs, § Responsive behavior).
 *
 * A breakpoint pair rather than a `variant` prop. The prop existed, defaulted
 * to `'desktop'`, and no production caller ever passed the other value — so
 * the mobile rendering was unreachable outside its own spec, which
 * `docs/system/guides/writing-web-components.md` §9 calls a permanently
 * untested path. The sibling `ArrivalTimingPanel` already expressed the same
 * requirement this way. */
const SEGMENT_WIDTH_CLASS = 'w-[14px] sm:w-[18px]';

/** Every third week is labelled below the breakpoint and every week above it
 * (`design-handoff.md` § Responsive behavior — `W28`, `W31`, `W34`…). Both
 * labels are rendered and CSS decides which is shown, for the reason above. */
const weekLabelClass = (index: number): string =>
  index % 3 === 0
    ? 'text-[10px] text-muted'
    : 'hidden text-[10px] text-muted sm:inline';

/** The plot's own fixed height in pixels, the track every week's whole is
 * scaled onto. */
const WEEK_PLOT_HEIGHT_PX = 96;

type OrderFlowSegment = {
  series: ChartLegendItem;
  value: number;
};

/** A week's whole, in bottom-up drawing order: Assigned to arrived goods →
 * Still awaited → Cancelled (AC-16). */
const segmentsOfWeek = (
  week: OrderFlowPanelBody['weeks'][number],
  legend: ChartLegendItem[],
): OrderFlowSegment[] => [
  { series: legend[0], value: week.assignedQuantity },
  { series: legend[1], value: week.stillAwaitedQuantity },
  { series: legend[2], value: week.cancelledQuantity },
];

type OrderFlowPanelProps = {
  panel: OrderFlowPanelBody;
};

export const OrderFlowPanel = ({
  panel,
}: OrderFlowPanelProps): ReactElement => {
  const { t } = useTranslation('dashboard');

  // Ordinal steps, dark to light: Assigned, Still awaited, Cancelled. Every
  // band is named in the legend so removing colour entirely loses no figure
  // (`design-handoff.md` § Accessibility, "Never colour alone").
  const legend: ChartLegendItem[] = [
    {
      id: 'assigned',
      label: t('panels.orderFlow.series.assigned'),
      colorVar: '--chart-ramp-4a',
    },
    {
      id: 'stillAwaited',
      label: t('panels.orderFlow.series.stillAwaited'),
      colorVar: '--chart-ramp-4b',
    },
    {
      id: 'cancelled',
      label: t('panels.orderFlow.series.cancelled'),
      colorVar: '--chart-ramp-4c',
    },
  ];

  // One shared domain across every week, so a week's whole is drawn to scale
  // against the others rather than each column filling its own height.
  const domainMax = Math.max(
    0,
    ...panel.weeks.map((week) => week.recordedQuantity),
  );

  // AC-17a's disclosure, read once and reused verbatim as both the footnote
  // and the chart's accessible summary, so the two cannot drift.
  const disclosure = t('panels.orderFlow.footnote');

  return (
    <PanelCard
      title={t('panels.orderFlow.title')}
      meta={t('panels.orderFlow.meta')}
    >
      <ChartLegend items={legend} />
      <div
        role="img"
        aria-label={disclosure}
        className="mt-2 flex items-end gap-1"
      >
        {panel.weeks.map((week, index) => (
          <div
            key={week.weekStart}
            data-testid={`order-flow-week-${week.weekStart}`}
            className="flex flex-1 flex-col items-center gap-1"
          >
            <div
              className="flex flex-col-reverse gap-0.5"
              style={{ height: WEEK_PLOT_HEIGHT_PX }}
            >
              {segmentsOfWeek(week, legend).map((segment) => (
                <div
                  key={segment.series.id}
                  data-quantity={segment.value}
                  className={`${SEGMENT_WIDTH_CLASS} last:rounded-t-[3px]`}
                  style={{
                    height: linearScale(
                      segment.value,
                      domainMax,
                      WEEK_PLOT_HEIGHT_PX,
                    ),
                    backgroundColor: `var(${segment.series.colorVar})`,
                  }}
                />
              ))}
            </div>
            <span className={weekLabelClass(index)}>
              W{isoWeekNumber(week.weekStart)}
            </span>
          </div>
        ))}
      </div>
      <PanelFootnote>{disclosure}</PanelFootnote>
    </PanelCard>
  );
};
