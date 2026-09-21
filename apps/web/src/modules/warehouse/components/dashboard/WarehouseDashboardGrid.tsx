import type {
  ArrivalTimingPanel,
  CoverageGapPanel as CoverageGapPanelBody,
  OpenPurchaseDraftState,
  PurchasingPipelinePanel,
  ReasonConcentrationPanel as ReasonConcentrationPanelBody,
} from '@warehouser/contracts/dashboards';
import compact from 'lodash/compact';
import { warehouseDashboardApi } from 'modules/warehouse/api/warehouse-dashboard-api';
import { CoverageGapPanel } from 'modules/warehouse/components/dashboard/CoverageGapPanel';
import { ReasonConcentrationPanel } from 'modules/warehouse/components/dashboard/ReasonConcentrationPanel';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ArchivedWarehouseChip } from 'shared/components/ArchivedWarehouseChip';
import type { ChartLegendItem } from 'shared/components/charts/ChartLegend';
import { ChartLegend } from 'shared/components/charts/ChartLegend';
import type { ColumnPlotBucket } from 'shared/components/charts/ColumnPlot';
import { ColumnPlot } from 'shared/components/charts/ColumnPlot';
import { PanelCard } from 'shared/components/charts/PanelCard';
import { PanelFootnote } from 'shared/components/charts/PanelFootnote';
import { StackedBarRow } from 'shared/components/charts/StackedBarRow';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';
import { ShieldXIcon } from 'shared/icons';
import { useAppSelector } from 'store/hooks';

/**
 * T16 — the Warehouse Dashboard's surface: the two-column grid, the fixed
 * Panel order, the reflow rule, the denial and the archived strip (AC-01,
 * AC-02, AC-02a, AC-13, AC-23; frames `Zz5PK` and `G4JNMV`).
 *
 * **A Panel is present when its body is present, and this file reads no
 * Permission at all.** Every Panel's Permission set is a conjunction — Coverage
 * Gap needs three, Arrival Timing two — which the gate components express no
 * way of stating, so `loaders/warehouse-dashboard.loader.ts` decides which
 * reads to issue and the grid derives presence from what that filled. One
 * answer to "may this actor read it?", in one place, and nothing here able to
 * draw a Panel the actor's authority never admitted
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md` §Decision 3).
 *
 * **Nothing marks an absence.** A withheld Panel leaves no frame, title, count,
 * placeholder or gap; the remaining Panels occupy the surface as though it had
 * never been part of it (`design-handoff.md` § Implementation constraints).
 *
 * Coverage Gap and Reason Concentration are drawn by their own components in
 * this directory (T17), each an accessible table over the shared chart scale.
 * The two Panel cards left below are private render helpers of this file
 * (`docs/system/guides/writing-web-components.md` §1) and are deliberately
 * provisional: T18 draws each of them in full — with every exclusion count in
 * its footnote — in its own file beside the other two.
 */

// ---------------------------------------------------------------------------
// Reading what the loader filled
// ---------------------------------------------------------------------------

type PanelBodies = {
  arrivalTiming: ArrivalTimingPanel | undefined;
  coverageGap: CoverageGapPanelBody | undefined;
  purchasingPipeline: PurchasingPipelinePanel | undefined;
  reasonConcentration: ReasonConcentrationPanelBody | undefined;
};

/**
 * The Panel bodies this entry's loader awaited, or `undefined` for a Panel
 * whose read it never issued.
 *
 * Read through each endpoint's own cache selector rather than through a
 * generated query hook, deliberately: a hook mounts a subscriber, and a
 * subscriber on an endpoint that re-reads on every initiation would issue a
 * request at first paint — which `spec.md` §6's read shape puts at zero, and
 * which `frontend-architecture.md` §Page gives the route rather than a
 * component. Each selector yields the cached body itself, so its reference is
 * stable between store updates and an unrelated dispatch re-renders nothing.
 */
const usePanelBodies = (warehouseId: string): PanelBodies => {
  const { endpoints } = warehouseDashboardApi;

  return {
    coverageGap: useAppSelector(
      (state) => endpoints.readCoverageGap.select(warehouseId)(state).data,
    ),
    reasonConcentration: useAppSelector(
      (state) =>
        endpoints.readReasonConcentration.select(warehouseId)(state).data,
    ),
    arrivalTiming: useAppSelector(
      (state) => endpoints.readArrivalTiming.select(warehouseId)(state).data,
    ),
    purchasingPipeline: useAppSelector(
      (state) =>
        endpoints.readPurchasingPipeline.select(warehouseId)(state).data,
    ),
  };
};

// ---------------------------------------------------------------------------
// Arrival Timing
// ---------------------------------------------------------------------------

/** The Panel's own fixed gridlines (`design-handoff.md` § Panel specs). */
const ARRIVAL_TIMING_GRIDLINES = [0, 1250, 2500];

/**
 * The scale's top: the Panel's stated headroom, raised only if a bucket would
 * otherwise overflow its track. The two series are **never netted** against
 * each other — no record links a week's arrivals to that week's demand — so
 * each is measured against the same domain rather than subtracted (AC-07).
 */
const arrivalTimingMax = (panel: ArrivalTimingPanel): number =>
  Math.max(
    ARRIVAL_TIMING_GRIDLINES.at(-1)!,
    ...panel.buckets.map((bucket) =>
      Math.max(bucket.owedQuantity, bucket.expectedQuantity),
    ),
  );

const ArrivalTimingPanelCard = ({
  panel,
}: {
  panel: ArrivalTimingPanel;
}): ReactElement => {
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

  const buckets: ColumnPlotBucket[] = panel.buckets.map((bucket) => ({
    id: bucket.weekStart ?? bucket.kind,
    label:
      bucket.weekStart === null
        ? t('panels.arrivalTiming.overdue')
        : shortCalendarDate(bucket.weekStart),
    values: {
      owed: bucket.owedQuantity,
      expectedAtDock: bucket.expectedQuantity,
    },
  }));

  const { exclusions } = panel;

  return (
    <PanelCard
      title={t('panels.arrivalTiming.title')}
      meta={t('panels.arrivalTiming.meta')}
    >
      <ChartLegend items={legend} />
      <ColumnPlot
        series={legend}
        buckets={buckets}
        gridlineValues={ARRIVAL_TIMING_GRIDLINES}
        maxValue={arrivalTimingMax(panel)}
      />
      {/* AC-07 / AC-08a — all four exclusion counts on one line, because a
          Panel that leaves demand out without saying so states a figure
          nobody can reconcile (`spec.md` §6 "Exclusion accounting"). */}
      <PanelFootnote>
        {t('panels.arrivalTiming.footnote', {
          beyondOrders: quantity(exclusions.beyondHorizon.customerOrderCount),
          beyondQuantity: quantity(exclusions.beyondHorizon.owedQuantity),
          datedStillInDraft: quantity(
            exclusions.datedDraftsStillInDraft.draftCount,
          ),
          sinceClosedOrDiscarded: quantity(
            exclusions.draftsSinceClosedOrDiscarded.draftCount,
          ),
          undatedDrafts: quantity(exclusions.undatedReadyDrafts.draftCount),
        })}
      </PanelFootnote>
    </PanelCard>
  );
};

// ---------------------------------------------------------------------------
// Purchasing Pipeline
// ---------------------------------------------------------------------------

const PurchasingPipelinePanelCard = ({
  panel,
}: {
  panel: PurchasingPipelinePanel;
}): ReactElement => {
  const { t } = useTranslation('dashboard');

  /** The four Age Bands, youngest first, on one shared scale (AC-10). */
  const legend: ChartLegendItem[] = [
    {
      id: 'upTo7Days',
      label: t('panels.purchasingPipeline.bands.upTo7Days'),
      colorVar: '--chart-ramp-4a',
    },
    {
      id: 'from8To14Days',
      label: t('panels.purchasingPipeline.bands.from8To14Days'),
      colorVar: '--chart-ramp-4b',
    },
    {
      id: 'from15To30Days',
      label: t('panels.purchasingPipeline.bands.from15To30Days'),
      colorVar: '--chart-ramp-4c',
    },
    {
      id: 'over30Days',
      label: t('panels.purchasingPipeline.bands.over30Days'),
      colorVar: '--chart-ramp-4d',
    },
  ];

  /**
   * A total lookup over the two open states the Panel counts, so a state added
   * to the contract fails to compile until it is given a name here rather than
   * rendering a raw key
   * (`docs/system/guides/writing-web-components.md` §6).
   */
  const stateLabels: Record<OpenPurchaseDraftState, string> = {
    draft: t('panels.purchasingPipeline.states.draft'),
    ready_for_ordering: t('panels.purchasingPipeline.states.readyForOrdering'),
  };

  return (
    <PanelCard
      title={t('panels.purchasingPipeline.title')}
      meta={t('panels.purchasingPipeline.meta')}
    >
      <ChartLegend items={legend} />
      <div className="mt-2 flex flex-col gap-1">
        {panel.states.map((state) => (
          <StackedBarRow
            key={state.state}
            label={stateLabels[state.state]}
            segments={state.bands.map((band, index) => ({
              ...legend[index],
              value: band.draftCount,
            }))}
            total={state.bands.reduce((sum, band) => sum + band.draftCount, 0)}
          />
        ))}
      </div>
      {/* AC-11 — the Panel counts drafts rather than quantities, and counts
          only the two open states. */}
      <PanelFootnote>{t('panels.purchasingPipeline.footnote')}</PanelFootnote>
    </PanelCard>
  );
};

// ---------------------------------------------------------------------------
// The denial
// ---------------------------------------------------------------------------

/**
 * AC-02 — the statement a member carrying no Panel's whole Permission set
 * reaches. It names no Panel, no Permission and nothing the Warehouse holds,
 * and draws no frame, axis or total (`design-handoff.md` § Implementation
 * constraints; frame `G4JNMV` tile 3).
 *
 * The shipped denial pattern states its heading as an `h1`; this one does not,
 * because the destination's `h1` is the page's own visually-hidden heading and
 * the surface's heading order is `h1 -> h2 x n` (`design-handoff.md`
 * § Accessibility). Everything else — the icon, the muted body, the
 * `max-w-3xl` column — is that pattern unchanged.
 */
const WarehouseDashboardDenial = (): ReactElement => {
  const { t } = useTranslation('dashboard');

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-left">
      <div className="text-muted">
        <ShieldXIcon />
      </div>
      <p className="mt-4 text-lg font-semibold text-foreground">
        {t('warehouse.denial.heading')}
      </p>
      <p className="mt-3 text-muted">{t('warehouse.denial.description')}</p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

type PanelCell = { element: ReactElement; id: string };

/**
 * A cell for a Panel the loader filled, and nothing for one it did not — which
 * is what makes an absence leave no trace in the sequence.
 */
const cellFor = <TBody,>(
  id: string,
  body: TBody | undefined,
  draw: (body: TBody) => ReactElement,
): PanelCell | null =>
  body === undefined ? null : { id, element: draw(body) };

/**
 * The cell a Panel occupies. Panels fill the two-column grid row-major in the
 * fixed order, and **a row holding a single Panel spans both columns** — which
 * is the trailing Panel of an odd-numbered set, and nothing else
 * (`design-handoff.md` § Reflow when fewer Panels are permitted). With all
 * four permitted no Panel spans and the surface is the 2 x 2 grid; below the
 * 1280px threshold the grid is one column, where nothing spans either.
 */
const cellClassName = (index: number, count: number): string | undefined =>
  index === count - 1 && count % 2 === 1 ? 'xl:col-span-2' : undefined;

export const WarehouseDashboardGrid = (): ReactElement => {
  const warehouseId = useEnteredWarehouse() ?? '';
  const bodies = usePanelBodies(warehouseId);

  // One fixed order governs the grid and every reflow: Coverage Gap, Reason
  // Concentration, Arrival Timing, Purchasing Pipeline (`design-handoff.md`
  // § Panel order). `compact` closes the sequence over a Panel the loader
  // never filled rather than leaving a gap where it would have been.
  const cells = compact([
    cellFor('coverageGap', bodies.coverageGap, (panel) => (
      <CoverageGapPanel panel={panel} />
    )),
    cellFor('reasonConcentration', bodies.reasonConcentration, (panel) => (
      <ReasonConcentrationPanel panel={panel} />
    )),
    cellFor('arrivalTiming', bodies.arrivalTiming, (panel) => (
      <ArrivalTimingPanelCard panel={panel} />
    )),
    cellFor('purchasingPipeline', bodies.purchasingPipeline, (panel) => (
      <PurchasingPipelinePanelCard panel={panel} />
    )),
  ]);

  if (cells.length === 0) {
    return <WarehouseDashboardDenial />;
  }

  return (
    <div>
      {/* AC-23 — the archived mark is the shipped chip in a strip above the
          grid, and it disables nothing. The chip draws nothing at all in a
          Warehouse still in operation, so the strip collapses with it rather
          than leaving a gap behind. */}
      <div className="mb-2 flex items-center empty:hidden">
        <ArchivedWarehouseChip />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {cells.map((cell, index) => (
          <div key={cell.id} className={cellClassName(index, cells.length)}>
            {cell.element}
          </div>
        ))}
      </div>
    </div>
  );
};
