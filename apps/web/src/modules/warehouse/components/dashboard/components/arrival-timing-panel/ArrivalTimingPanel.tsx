import type {
  ArrivalTimingBucket,
  ArrivalTimingPanel as ArrivalTimingPanelBody,
} from '@warehouser/contracts/dashboards';
import type { ColumnPlotBucket } from 'modules/warehouse/components/dashboard/components/arrival-timing-panel/components/ColumnPlot';
import { ColumnPlot } from 'modules/warehouse/components/dashboard/components/arrival-timing-panel/components/ColumnPlot';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartLegendItem } from 'shared/components/charts/ChartLegend';
import { ChartLegend } from 'shared/components/charts/ChartLegend';
import { PanelCard } from 'shared/components/charts/PanelCard';
import { PanelFootnote } from 'shared/components/charts/PanelFootnote';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';
import { isoWeekNumber } from 'shared/utils/iso-week-number';

/**
 * T18 — the Arrival Timing Panel (AC-07, AC-08a; `design-handoff.md` §
 * Panel specifications, frame `z8UrQP`). Extracted from
 * `WarehouseDashboardGrid.tsx`'s provisional `ArrivalTimingPanelCard` (T16)
 * into its own file beside the other three Panels, one directory per
 * `docs/system/guides/placing-web-components.md` § "Grouping owned
 * components by domain".
 *
 * **The accessible summary.** `design-handoff.md` § Accessibility → Structure
 * gives a chart "an accessible summary naming what they plot and the counts
 * they exclude — the same text the footnote shows." Neither `ColumnPlot` nor
 * `BubblePlot` carries a `role` or a summary prop, and `shared/components/
 * charts/` is shared with two other in-flight lanes, so this Panel wraps its
 * own plot region — the gridlines, the columns and the week axis — in an
 * element carrying `role="img"` and an `aria-label` built from the exact same
 * `t()` call the visible footnote renders, so the two can never drift apart
 * (lead ruling, `ArrivalTimingPanel.spec.tsx`).
 *
 * **The two responsive week labels.** `ColumnPlot` accepts one plain string
 * per bucket and prints it in its own label row; it cannot carry the desktop
 * calendar-date label and the mobile bare week number as two elements
 * revealed by breakpoint (`design-handoff.md` § Responsive behavior), and
 * this Panel does not touch `ColumnPlot` to make it. So `ColumnPlot` is fed an
 * empty label per bucket and this component draws its own label row beneath
 * the plot — the `hidden sm:inline` / `sm:hidden` pair
 * `WorkspaceAdministration.tsx` already establishes for exactly this shape —
 * which is also why that row is `aria-hidden`: the axis it draws is already
 * named by the plot's own accessible summary, not by a fourth, per-column
 * announcement.
 *
 * **The legend is `shared/components/charts/ChartLegend`**, the one
 * mechanism this repository has for "every multi-series chart carries a
 * legend whose keys are text" (`design-handoff.md` § Accessibility;
 * `ChartLegend`'s own doc comment states the same contract). It sits outside
 * the `role="img"` plot region above, so `ArrivalTimingPanel.spec.tsx`'s own
 * `columnsFilledWith` helper — scoped to that region — counts only the marks
 * `ColumnPlot` draws, never the legend's swatches.
 */

/** The Panel's own fixed gridlines (`design-handoff.md` § Panel specs). */
const ARRIVAL_TIMING_GRIDLINES = [0, 1250, 2500];

/**
 * The scale's top: the Panel's stated headroom, raised only if a bucket would
 * otherwise overflow its track. The two series are **never netted** against
 * each other — no record links a week's arrivals to that week's demand — so
 * each is measured against the same domain rather than subtracted (AC-07).
 */
const arrivalTimingMax = (panel: ArrivalTimingPanelBody): number =>
  Math.max(
    ARRIVAL_TIMING_GRIDLINES.at(-1)!,
    ...panel.buckets.map((bucket) =>
      Math.max(bucket.owedQuantity, bucket.expectedQuantity),
    ),
  );

type ArrivalTimingPanelProps = {
  panel: ArrivalTimingPanelBody;
};

export const ArrivalTimingPanel = ({
  panel,
}: ArrivalTimingPanelProps): ReactElement => {
  const { t } = useTranslation('dashboard');
  const { quantity, shortCalendarDate } = useLocaleFormat();

  const legend: ChartLegendItem[] = [
    {
      id: 'owed',
      label: t('panels.arrivalTiming.series.owed'),
      colorVar: '--chart-ramp-3b',
    },
    {
      id: 'expectedAtDock',
      label: t('panels.arrivalTiming.series.expectedAtDock'),
      colorVar: '--chart-supply',
    },
  ];

  const overdueLabel = t('panels.arrivalTiming.overdue');

  // `ColumnPlot`'s own label row is unused for display (see the file
  // header), so every bucket hands it an empty string rather than a value a
  // reader would see twice.
  const buckets: ColumnPlotBucket[] = panel.buckets.map((bucket) => ({
    id: bucket.weekStart ?? bucket.kind,
    label: '',
    values: {
      owed: bucket.owedQuantity,
      expectedAtDock: bucket.expectedQuantity,
    },
  }));

  // The bucket's own two-width label, resolved to a named element before the
  // row is built rather than as an inline ternary
  // (`docs/system/guides/writing-web-conditional-components.md` §2): the
  // Overdue bucket carries no week to bare down to, so it keeps its one
  // label at both widths instead of gaining an empty mobile variant.
  const bucketLabelContent = (bucket: ArrivalTimingBucket): ReactNode => {
    if (bucket.weekStart === null) {
      return overdueLabel;
    }

    return (
      <>
        <span className="hidden sm:inline">
          {shortCalendarDate(bucket.weekStart)}
        </span>
        <span className="sm:hidden">{isoWeekNumber(bucket.weekStart)}</span>
      </>
    );
  };

  const { exclusions } = panel;

  // AC-07 / AC-08a — all four exclusion counts on one line, because a Panel
  // that leaves demand out without saying so states a figure nobody can
  // reconcile (`spec.md` §6 "Exclusion accounting"). Read by both the visible
  // footnote and the plot's accessible summary below, so the two can never
  // state different counts.
  const exclusionsSummary = t('panels.arrivalTiming.footnote', {
    beyondOrders: quantity(exclusions.beyondHorizon.customerOrderCount),
    beyondQuantity: quantity(exclusions.beyondHorizon.owedQuantity),
    datedStillInDraft: quantity(exclusions.datedDraftsStillInDraft.draftCount),
    sinceClosedOrDiscarded: quantity(
      exclusions.draftsSinceClosedOrDiscarded.draftCount,
    ),
    undatedDrafts: quantity(exclusions.undatedReadyDrafts.draftCount),
  });

  return (
    <PanelCard
      title={t('panels.arrivalTiming.title')}
      meta={t('panels.arrivalTiming.meta')}
    >
      <ChartLegend items={legend} />
      <div role="img" aria-label={exclusionsSummary}>
        <ColumnPlot
          series={legend}
          buckets={buckets}
          gridlineValues={ARRIVAL_TIMING_GRIDLINES}
          maxValue={arrivalTimingMax(panel)}
        />
        <div
          aria-hidden="true"
          className="mt-1 flex justify-center gap-2 text-[10px] text-muted"
        >
          {panel.buckets.map((bucket) => (
            <span
              key={bucket.weekStart ?? bucket.kind}
              className="flex-1 text-center"
            >
              {bucketLabelContent(bucket)}
            </span>
          ))}
        </div>
      </div>
      <PanelFootnote>{exclusionsSummary}</PanelFootnote>
    </PanelCard>
  );
};
