import type {
  DemandPressurePanel,
  OrderFlowPanel,
  PurchasingSpreadPanel,
  ReceiptReliabilityPanel,
} from '@warehouser/contracts/dashboards';
import compact from 'lodash/compact';
import { workspaceDashboardApi } from 'modules/workspace-dashboard/api/workspace-dashboard-api';
import { DemandPressurePanel as DemandPressurePanelView } from 'modules/workspace-dashboard/components/DemandPressurePanel';
import { OrderFlowPanel as OrderFlowPanelView } from 'modules/workspace-dashboard/components/OrderFlowPanel';
import { PurchasingSpreadPanel as PurchasingSpreadPanelView } from 'modules/workspace-dashboard/components/PurchasingSpreadPanel';
import { ReceiptReliabilityPanel as ReceiptReliabilityPanelView } from 'modules/workspace-dashboard/components/ReceiptReliabilityPanel';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldXIcon } from 'shared/icons';
import { useAppSelector } from 'store/hooks';

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
// Reading what the loader filled
// ---------------------------------------------------------------------------

type PanelBodies = {
  demandPressure: DemandPressurePanel | undefined;
  orderFlow: OrderFlowPanel | undefined;
  purchasingSpread: PurchasingSpreadPanel | undefined;
  receiptReliability: ReceiptReliabilityPanel | undefined;
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
const usePanelBodies = (): PanelBodies => {
  const { endpoints } = workspaceDashboardApi;

  return {
    demandPressure: useAppSelector(
      (state) => endpoints.readDemandPressure.select(undefined)(state).data,
    ),
    orderFlow: useAppSelector(
      (state) => endpoints.readOrderFlow.select(undefined)(state).data,
    ),
    purchasingSpread: useAppSelector(
      (state) => endpoints.readPurchasingSpread.select(undefined)(state).data,
    ),
    receiptReliability: useAppSelector(
      (state) => endpoints.readReceiptReliability.select(undefined)(state).data,
    ),
  };
};

// ---------------------------------------------------------------------------
// The denial
// ---------------------------------------------------------------------------

/**
 * AC-15 — the statement a Workspace Member whose Workspace Role does not carry
 * the observation Permission reaches, **at the address** rather than after a
 * redirect away from it. It names no Warehouse, no Permission and no figure,
 * and discloses neither how many Warehouses the Workspace holds nor whether
 * any of them has anything outstanding (frame `ujNPP` tile 1).
 *
 * AC-22 — a Warehouse Member holding every watch Permission in their own
 * Warehouse and no Workspace Role reaches this same statement, unchanged.
 *
 * It is the shipped denial pattern, and states its heading as a `p` rather
 * than an `h1` for the reason `modules/warehouse`'s does: the destination's
 * `h1` is the page's own visually-hidden heading and the surface's heading
 * order is `h1 -> h2 x n` (`design-handoff.md` § Accessibility).
 */
const WorkspaceDashboardDenial = (): ReactElement => {
  const { t } = useTranslation('dashboard');

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-left">
      <div className="text-muted">
        <ShieldXIcon />
      </div>
      <p className="mt-4 text-lg font-semibold text-foreground">
        {t('workspace.denial.heading')}
      </p>
      <p className="mt-3 text-muted">{t('workspace.denial.description')}</p>
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
 * (`design-handoff.md` § Reflow when fewer Panels are permitted). Below the
 * 1280px threshold the grid is one column, where nothing spans either.
 */
const cellClassName = (index: number, count: number): string | undefined =>
  index === count - 1 && count % 2 === 1 ? 'xl:col-span-2' : undefined;

export const WorkspaceDashboardGrid = (): ReactElement => {
  const bodies = usePanelBodies();

  // One fixed order governs the grid and every reflow: Demand Pressure, Order
  // Flow, Purchasing Spread, Receipt Reliability (`design-handoff.md` § Panel
  // order). `compact` closes the sequence over a Panel the loader never filled
  // rather than leaving a gap where it would have been.
  const cells = compact([
    cellFor('demandPressure', bodies.demandPressure, (panel) => (
      <DemandPressurePanelView panel={panel} />
    )),
    cellFor('orderFlow', bodies.orderFlow, (panel) => (
      <OrderFlowPanelView panel={panel} />
    )),
    cellFor('purchasingSpread', bodies.purchasingSpread, (panel) => (
      <PurchasingSpreadPanelView panel={panel} />
    )),
    cellFor('receiptReliability', bodies.receiptReliability, (panel) => (
      <ReceiptReliabilityPanelView panel={panel} />
    )),
  ]);

  if (cells.length === 0) {
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
