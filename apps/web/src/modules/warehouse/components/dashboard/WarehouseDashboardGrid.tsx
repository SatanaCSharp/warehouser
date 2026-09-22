import type {
  ArrivalTimingPanel as ArrivalTimingPanelBody,
  CoverageGapPanel as CoverageGapPanelBody,
  PurchasingPipelinePanel as PurchasingPipelinePanelBody,
  ReasonConcentrationPanel as ReasonConcentrationPanelBody,
} from '@warehouser/contracts/dashboards';
import compact from 'lodash/compact';
import { warehouseDashboardApi } from 'modules/warehouse/api/warehouse-dashboard-api';
import { ArrivalTimingPanel } from 'modules/warehouse/components/dashboard/components/arrival-timing-panel/ArrivalTimingPanel';
import { CoverageGapPanel } from 'modules/warehouse/components/dashboard/components/coverage-gap-panel/CoverageGapPanel';
import { PurchasingPipelinePanel } from 'modules/warehouse/components/dashboard/components/PurchasingPipelinePanel';
import { ReasonConcentrationPanel } from 'modules/warehouse/components/dashboard/components/reason-concentration-panel/ReasonConcentrationPanel';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ArchivedWarehouseChip } from 'shared/components/ArchivedWarehouseChip';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
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
 * All four Panels are drawn by their own components in this directory: T17
 * shipped Coverage Gap and Reason Concentration, each an accessible table
 * over the shared chart scale; T18 completes Arrival Timing and Purchasing
 * Pipeline, each a chart carrying its own accessible summary
 * (`ArrivalTimingPanel.tsx`, `PurchasingPipelinePanel.tsx`). This file wires
 * all four into the grid and owns nothing about how any one of them draws.
 */

// ---------------------------------------------------------------------------
// Reading what the loader filled
// ---------------------------------------------------------------------------

type PanelBodies = {
  arrivalTiming: ArrivalTimingPanelBody | undefined;
  coverageGap: CoverageGapPanelBody | undefined;
  purchasingPipeline: PurchasingPipelinePanelBody | undefined;
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
      <ArrivalTimingPanel panel={panel} />
    )),
    cellFor('purchasingPipeline', bodies.purchasingPipeline, (panel) => (
      <PurchasingPipelinePanel panel={panel} />
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
