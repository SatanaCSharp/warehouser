import { PermissionId } from '@warehouser/shared-types/enums';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import { admitsReads } from 'guards/warehouse-entry.guard';
import { warehouseDashboardApi } from 'modules/warehouse/api/warehouse-dashboard-api';
import type { RouterContext } from 'routes/__root.route';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import { hasPermission } from 'shared/hooks/queries/usePermissions';
import type { AppStore } from 'store';

/**
 * The router context inside the Warehouse Dashboard's route: the application
 * context every route carries, plus the entry verdict
 * `warehouseRoute.beforeLoad` publishes into the Warehouse layout match.
 */
export type WarehouseDashboardLoaderContext = RouterContext &
  WarehouseEntryVerdict;

export type WarehouseDashboardLoaderInput = {
  context: WarehouseDashboardLoaderContext;
};

/**
 * A loader-filled entry holds no subscriber of *this dispatch's* own; the
 * destination's Panel hooks subscribe to it a moment later and retain it
 * (sad.md §4.4, `hooks/queries/usePanelBodies.ts`).
 *
 * `forceRefetch` is AC-26 — freshness is refetch on entering, and nothing
 * else. It is declared here, on the one dispatch that means "the member is
 * entering", rather than on the endpoint: an endpoint-level `forceRefetch`
 * fires on *every* initiation, including the destination's own subscription a
 * moment after this one, which issued a second read per Panel and broke
 * `spec.md` §6's read shape. The parity spec asserts every Panel read is
 * dispatched with both options, so the guarantee stays mechanical rather than
 * relying on a caller to remember it.
 */
const LOADER_QUERY_OPTIONS = { forceRefetch: true, subscribe: false } as const;

/**
 * One Panel read, with the **whole** Permission set its figures are drawn from
 * (`spec.md` §6.1 Panel table).
 *
 * The set is a conjunction — Coverage Gap needs three Permissions and Arrival
 * Timing two — and that is precisely why the decision is made here rather than
 * at the Panel. `docs/system/adr/19-08-2026-declarative-permission-gates.md`
 * §Decision 3 admits a Permission read as a boolean where the answer "feeds a
 * query `skip`, so a dataset the actor may not read is never requested"; which
 * reads to issue at all is that case, and the read stays in this one file.
 * The gate components express a disjunction only, so no gate can state a
 * Panel's presence — and inventing a second gating mechanism would be an
 * ADR-sized decision rather than an implementation detail
 * (`ai/skills/writing-app-code/SKILL.md` §6).
 */
type PanelRead = {
  permissions: readonly PermissionId[];
  /**
   * Dispatches the Panel's read. The endpoint is dereferenced here, at call
   * time, rather than captured when this table is built — a table holding the
   * `initiate` reference would bind one module instance for the life of the
   * process.
   */
  dispatch: (store: AppStore, warehouseId: string) => Promise<unknown>;
};

/**
 * The four Panels in the fixed order one rule governs — Coverage Gap, Reason
 * Concentration, Arrival Timing, Purchasing Pipeline
 * (`design-handoff.md` § Panel order). Every read is issued together and each
 * is awaited, so the destination mounts with every permitted figure present
 * and no Panel paints ahead of the others (`spec.md` §6 read shape).
 */
const PANEL_READS: readonly PanelRead[] = [
  {
    permissions: [
      PermissionId.CUSTOMER_ORDERS_WATCH,
      PermissionId.ITEMS_WATCH,
      PermissionId.PURCHASE_DRAFTS_WATCH,
    ],
    dispatch: (store, warehouseId) =>
      store.dispatch(
        warehouseDashboardApi.endpoints.readCoverageGap.initiate(
          warehouseId,
          LOADER_QUERY_OPTIONS,
        ),
      ),
  },
  {
    permissions: [PermissionId.REJECTIONS_WATCH],
    dispatch: (store, warehouseId) =>
      store.dispatch(
        warehouseDashboardApi.endpoints.readReasonConcentration.initiate(
          warehouseId,
          LOADER_QUERY_OPTIONS,
        ),
      ),
  },
  {
    permissions: [
      PermissionId.CUSTOMER_ORDERS_WATCH,
      PermissionId.PURCHASE_DRAFTS_WATCH,
    ],
    dispatch: (store, warehouseId) =>
      store.dispatch(
        warehouseDashboardApi.endpoints.readArrivalTiming.initiate(
          warehouseId,
          LOADER_QUERY_OPTIONS,
        ),
      ),
  },
  {
    permissions: [PermissionId.PURCHASE_DRAFTS_WATCH],
    dispatch: (store, warehouseId) =>
      store.dispatch(
        warehouseDashboardApi.endpoints.readPurchasingPipeline.initiate(
          warehouseId,
          LOADER_QUERY_OPTIONS,
        ),
      ),
  },
];

/**
 * The Warehouse Dashboard's await window (sad.md §6.1): the entry-verdict
 * gate, the projection every Panel's Permission set is read from, and the
 * Panel reads that projection admits.
 *
 * **The gate comes first, and it issues nothing.** `warehouseRoute.beforeLoad`
 * returns a refusal verdict rather than throwing, so this loader still runs on
 * an address the actor was just refused. A refused verdict returns
 * immediately: not the projection, and not a single Panel, so a refusal costs
 * zero requests (AC-02).
 *
 * AC-23 — an archived Warehouse changes no Permission term. It withdraws every
 * operation that changes what the Warehouse holds, not what a member may read,
 * so `admitsReads` — not `status === 'entered'` — is the gate and the same
 * Panels are issued on exactly the pre-archiving terms.
 *
 * It imports no page and no component: `route.tsx` reaches it from the router
 * chunk, so pulling one in would defeat the lazy `import('./page')` boundary.
 */
export const loadWarehouseDashboard = async ({
  context,
}: WarehouseDashboardLoaderInput): Promise<void> => {
  if (!admitsReads(context)) {
    return;
  }

  const { store, warehouseId } = context;

  const access = await store
    .dispatch(
      accessPermissionsApi.endpoints.getCurrentAccess.initiate(
        warehouseId,
        LOADER_QUERY_OPTIONS,
      ),
    )
    .unwrap();

  // `'all'` is the whole point: a Panel is present only when the actor holds
  // **every** Permission its figures are drawn from, so a member holding two
  // of Coverage Gap's three reads none of it (AC-02, AC-13).
  const admitted = PANEL_READS.filter(({ permissions }) =>
    hasPermission(access.permissionIds, permissions, 'all'),
  );

  await Promise.all(
    admitted.map((panel) => panel.dispatch(store, warehouseId)),
  );
};
