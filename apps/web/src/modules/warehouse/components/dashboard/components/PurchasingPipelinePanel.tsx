import type {
  AgeBand,
  OpenPurchaseDraftState,
  PurchasingPipelinePanel as PurchasingPipelinePanelBody,
} from '@warehouser/contracts/dashboards';
import sum from 'lodash/sum';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartLegendItem } from 'shared/components/charts/ChartLegend';
import { ChartLegend } from 'shared/components/charts/ChartLegend';
import { PanelCard } from 'shared/components/charts/PanelCard';
import { PanelFootnote } from 'shared/components/charts/PanelFootnote';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';
import { linearScale } from 'shared/utils/chart-scale';

/**
 * T18 — the Purchasing Pipeline Panel (AC-10, AC-11; `design-handoff.md` §
 * Panel specifications, frame `fbew6`). Extracted from
 * `WarehouseDashboardGrid.tsx`'s provisional `PurchasingPipelinePanelCard`
 * (T16) into its own file beside the other three Panels
 * (`docs/system/guides/placing-web-components.md` § "Grouping owned
 * components by domain").
 *
 * **Why this bar is drawn here rather than taken from a shared primitive.**
 * A row primitive prints every segment's value in its own column to the right
 * of the bar; `design-handoff.md` § Panel specifications states plainly "every
 * segment prints its count" *inside* the fill, "chosen by fill luminance" —
 * so the ink is picked per segment from the fill beneath it, as this file's own
 * `CELL_INK_CLASS` does. Such a primitive also scales each row's segments to
 * fill its own
 * track with `flexGrow`, which would make every row's total look the same
 * width regardless of how many drafts it actually holds; this Panel draws on
 * **one shared linear scale**
 * instead, so a row's bar length reflects its total against the other row's
 * (`design-handoff.md`: "a shared scale with headroom to 50 drafts") — the
 * same failure mode `CoverageGapPanel.tsx`'s own `domainMax` comment names
 * for exactly this reason.
 *
 * **The accessible summary.** As `ArrivalTimingPanel.tsx` resolves the same
 * requirement, this Panel wraps its own plot region — the two stacked bars —
 * in an element carrying `role="img"` and an `aria-label` equal to the same
 * translated footnote text. AC-11's exclusion is categorical copy ("Closed
 * and Discarded drafts are not counted"), not a projection number —
 * `purchasingPipelinePanelSchema` carries no `exclusions` field — so the
 * summary is the same static translation the footnote renders, not an
 * interpolated one.
 */

/** Youngest first, the fixed order both the bar and its legend draw
 * (AC-10). */
const AGE_BANDS: AgeBand[] = [
  'up_to_7_days',
  'from_8_to_14_days',
  'from_15_to_30_days',
  'over_30_days',
];

const AGE_BAND_COLOR_VAR: Record<AgeBand, string> = {
  up_to_7_days: '--chart-ramp-4a',
  from_8_to_14_days: '--chart-ramp-4b',
  from_15_to_30_days: '--chart-ramp-4c',
  over_30_days: '--chart-ramp-4d',
};

const AGE_BAND_TRANSLATION_KEY: Record<AgeBand, string> = {
  up_to_7_days: 'panels.purchasingPipeline.bands.upTo7Days',
  from_8_to_14_days: 'panels.purchasingPipeline.bands.from8To14Days',
  from_15_to_30_days: 'panels.purchasingPipeline.bands.from15To30Days',
  over_30_days: 'panels.purchasingPipeline.bands.over30Days',
};

/**
 * The ink a segment's printed count takes, chosen by the fill's own
 * luminance rather than fixed: `$accent/foreground` on the two darkest
 * bands, `$foreground/foreground` on the two lightest
 * (`design-handoff.md` § Accessibility, "Text never wears the data colour"),
 * mirroring `HeatGrid.tsx`'s own `CELL_INK_CLASS`.
 */
const AGE_BAND_INK_CLASS: Record<AgeBand, string> = {
  up_to_7_days: 'text-accent-foreground',
  from_8_to_14_days: 'text-accent-foreground',
  from_15_to_30_days: 'text-foreground',
  over_30_days: 'text-foreground',
};

/** The scale's stated floor: a row's own total may raise it, but it is never
 * lower (`design-handoff.md`: "a shared scale with headroom to 50
 * drafts"). */
const SCALE_HEADROOM_DRAFTS = 50;

const purchasingPipelineMax = (panel: PurchasingPipelinePanelBody): number =>
  Math.max(
    SCALE_HEADROOM_DRAFTS,
    ...panel.states.map((state) =>
      sum(state.bands.map((band) => band.draftCount)),
    ),
  );

type PurchasingPipelinePanelProps = {
  panel: PurchasingPipelinePanelBody;
};

export const PurchasingPipelinePanel = ({
  panel,
}: PurchasingPipelinePanelProps): ReactElement => {
  const { t } = useTranslation('dashboard');
  const { quantity } = useLocaleFormat();

  const legend: ChartLegendItem[] = AGE_BANDS.map((ageBand) => ({
    id: ageBand,
    label: t(AGE_BAND_TRANSLATION_KEY[ageBand]),
    colorVar: AGE_BAND_COLOR_VAR[ageBand],
  }));

  /**
   * A total lookup over the two open states the Panel counts, so a state
   * added to the contract fails to compile until it is given a name here
   * rather than rendering a raw key
   * (`docs/system/guides/writing-web-components.md` §6).
   */
  const stateLabels: Record<OpenPurchaseDraftState, string> = {
    draft: t('panels.purchasingPipeline.states.draft'),
    ready_for_ordering: t('panels.purchasingPipeline.states.readyForOrdering'),
  };

  // AC-11 — the footnote states that the Panel counts drafts rather than
  // quantities, and that Closed and Discarded drafts are not counted. Read by
  // both the visible footnote and the plot's accessible summary below, so the
  // two can never state different copy.
  const footnoteText = t('panels.purchasingPipeline.footnote');
  const domainMax = purchasingPipelineMax(panel);

  return (
    <PanelCard
      title={t('panels.purchasingPipeline.title')}
      meta={t('panels.purchasingPipeline.meta')}
    >
      <ChartLegend items={legend} />
      <div
        role="img"
        aria-label={footnoteText}
        className="mt-2 flex flex-col gap-2"
      >
        {panel.states.map((state) => (
          <div
            key={state.state}
            data-testid={`pipeline-state-${state.state}`}
            className="flex items-center gap-2 text-xs"
          >
            <span className="w-28 flex-none truncate text-foreground">
              {stateLabels[state.state]}
            </span>
            <div
              className="flex h-6 flex-1 overflow-hidden rounded-[3px]"
              style={{ backgroundColor: 'var(--chart-track)' }}
            >
              {state.bands.map((band) => (
                <span
                  key={band.ageBand}
                  className={`flex h-full items-center justify-center font-semibold tabular-nums ${AGE_BAND_INK_CLASS[band.ageBand]}`}
                  style={{
                    width: `${linearScale(band.draftCount, domainMax, 100)}%`,
                    backgroundColor: `var(${AGE_BAND_COLOR_VAR[band.ageBand]})`,
                  }}
                >
                  {quantity(band.draftCount)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <PanelFootnote>{footnoteText}</PanelFootnote>
    </PanelCard>
  );
};
