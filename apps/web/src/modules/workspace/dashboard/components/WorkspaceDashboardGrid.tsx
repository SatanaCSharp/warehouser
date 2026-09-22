import compact from 'lodash/compact';
import { DemandPressurePanel as DemandPressurePanelView } from 'modules/workspace/dashboard/components/components/demand-pressure-panel/DemandPressurePanel';
import { OrderFlowPanel as OrderFlowPanelView } from 'modules/workspace/dashboard/components/components/OrderFlowPanel';
import { PurchasingSpreadPanel as PurchasingSpreadPanelView } from 'modules/workspace/dashboard/components/components/purchasing-spread-panel/PurchasingSpreadPanel';
import { ReceiptReliabilityPanel as ReceiptReliabilityPanelView } from 'modules/workspace/dashboard/components/components/receipt-reliability-panel/ReceiptReliabilityPanel';
import { WorkspaceDashboardDenial } from 'modules/workspace/dashboard/components/components/WorkspaceDashboardDenial';
import { useDemandPressurePanel } from 'modules/workspace/dashboard/hooks/queries/useDemandPressurePanel';
import { useOrderFlowPanel } from 'modules/workspace/dashboard/hooks/queries/useOrderFlowPanel';
import { usePurchasingSpreadPanel } from 'modules/workspace/dashboard/hooks/queries/usePurchasingSpreadPanel';
import { useReceiptReliabilityPanel } from 'modules/workspace/dashboard/hooks/queries/useReceiptReliabilityPanel';
import type { WorkspacePanelReading } from 'modules/workspace/dashboard/utils/workspace-panel-reading';
import type { ReactElement } from 'react';
import { PanelReadFailure } from 'shared/components/charts/PanelReadFailure';

/**
 * T19 — the Workspace Dashboard's surface: the two-column grid, the fixed
 * Panel order, the reflow rule and the denial (AC-14, AC-15, AC-22; frame
 * `ujNPP` tile 1).
 *
 * **A Panel is present when its body is present, and this file reads no
 * Permission at all.** One Workspace Permission admits all four Panels, and
 * `loaders/workspace-dashboard.loader.ts` is where it is read — so the grid
 * derives presence from what that loader filled and can draw nothing the
 * actor's authority never admitted
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md` §Decision 3).
 *
 * **Nothing marks an absence.** A withheld Panel leaves no frame, title,
 * count, placeholder or gap (`design-handoff.md` § Implementation
 * constraints).
 *
 * T20 drew Demand Pressure and Purchasing Spread in full, each in its own
 * file under this directory (`DemandPressurePanel.tsx`,
 * `PurchasingSpreadPanel.tsx`); T21 did the same for Order Flow and Receipt
 * Reliability (`OrderFlowPanel.tsx`, `ReceiptReliabilityPanel.tsx`). This
 * file wires all four bodies to those components and owns nothing about how
 * any of them is drawn.
 */

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

type PanelCell = { element: ReactElement; id: string };

/**
 * A cell for a Panel the loader filled, and nothing for one it did not — which
 * is what makes an absence leave no trace in the sequence.
 */
/**
 * The cell a Panel occupies, from the Panel's own standing.
 *
 * A Panel whose read **failed** renders its own error arm rather than being
 * absent, because `docs/system/frontend-architecture.md` §Page gives error,
 * empty and success to the narrowest component that can coordinate them and
 * says a permitted actor whose read failed "still reaches that component's own
 * error arm rather than an empty surface". Absence is reserved for a Panel
 * that was never issued.
 */
const cellFor = <TBody,>(
  id: string,
  reading: WorkspacePanelReading<TBody>,
  draw: (body: TBody) => ReactElement,
): PanelCell | null => {
  if (reading.failed) {
    return { id, element: <PanelReadFailure /> };
  }

  return reading.body === undefined
    ? null
    : { id, element: draw(reading.body) };
};

/**
 * The cell a Panel occupies. Panels fill the two-column grid row-major in the
 * fixed order, and **a row holding a single Panel spans both columns** — which
 * is the trailing Panel of an odd-numbered set, and nothing else
 * (`design-handoff.md` § Reflow when fewer Panels are permitted). Below the
 * 1280px threshold the grid is one column, where nothing spans either.
 */
const cellClassName = (index: number, count: number): string | undefined =>
  index === count - 1 && count % 2 === 1 ? 'xl:col-span-2' : undefined;

export const WorkspaceDashboardGrid = (): ReactElement => {
  const demandPressure = useDemandPressurePanel();
  const orderFlow = useOrderFlowPanel();
  const purchasingSpread = usePurchasingSpreadPanel();
  const receiptReliability = useReceiptReliabilityPanel();

  // One fixed order governs the grid and every reflow: Demand Pressure, Order
  // Flow, Purchasing Spread, Receipt Reliability (`design-handoff.md` § Panel
  // order). `compact` closes the sequence over a Panel the loader never filled
  // rather than leaving a gap where it would have been.
  const cells = compact([
    cellFor('demandPressure', demandPressure, (panel) => (
      <DemandPressurePanelView panel={panel} />
    )),
    cellFor('orderFlow', orderFlow, (panel) => (
      <OrderFlowPanelView panel={panel} />
    )),
    cellFor('purchasingSpread', purchasingSpread, (panel) => (
      <PurchasingSpreadPanelView panel={panel} />
    )),
    cellFor('receiptReliability', receiptReliability, (panel) => (
      <ReceiptReliabilityPanelView panel={panel} />
    )),
  ]);

  // AC-15/AC-22 — the denial answers "does this member's Workspace Role admit
  // the Dashboard at all", so it is read from that Permission rather than
  // inferred from the grid being empty. All four Panels share one admitting
  // Permission, so this is the choice between two whole surfaces that
  // `docs/system/adr/19-08-2026-declarative-permission-gates.md` §Decision 3
  // keeps as an early return. Inferred from the cache it also answered "every
  // read failed" and "the entries were collected", and said the member's Role
  // does not admit them — which in those two cases was untrue.
  if (!demandPressure.permitted) {
    return <WorkspaceDashboardDenial />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {cells.map((cell, index) => (
        <div key={cell.id} className={cellClassName(index, cells.length)}>
          {cell.element}
        </div>
      ))}
    </div>
  );
};
