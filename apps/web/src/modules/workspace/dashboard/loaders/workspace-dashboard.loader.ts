import { WorkspacePermissionId as WorkspacePermissionIdValue } from '@warehouser/shared-types/enums';
import { workspaceDashboardApi } from 'modules/workspace/dashboard/api/workspace-dashboard-api';
import type { RouterContext } from 'routes/__root.route';
import { workspaceContextApi } from 'shared/api/workspace/workspace-context-api';
import { hasWorkspacePermission } from 'shared/hooks/queries/useWorkspacePermissions';
import type { AppStore } from 'store';

export type WorkspaceDashboardLoaderInput = { context: RouterContext };

/**
 * A loader-filled entry holds no subscriber of its own; the destination reads
 * the body it filled rather than re-requesting it (sad.md §4.4). The refetch
 * that keeps a figure current is declared on the endpoint, not here, so this
 * option object stays the dispatch's only one (AC-26).
 */
/**
 * `forceRefetch` is AC-26 — freshness is refetch on entering, and nothing
 * else — declared on the one dispatch that means "the member is entering"
 * rather than on the endpoint. An endpoint-level `forceRefetch` fires on every
 * initiation, including the destination's own subscription a moment later,
 * which issued a second read per Panel against `spec.md` §6's read shape. The
 * destination must subscribe, or RTK Query collects the loader-filled entry
 * 60 s after it settles (`hooks/queries/useWorkspacePanelBodies.ts`).
 */
const LOADER_QUERY_OPTIONS = { forceRefetch: true, subscribe: false } as const;

/**
 * The four Panels in the fixed order one rule governs — Demand Pressure, Order
 * Flow, Purchasing Spread, Receipt Reliability
 * (`design-handoff.md` § Panel order).
 *
 * The endpoint is dereferenced at call time rather than captured when this
 * table is built: a table holding the `initiate` reference would bind one
 * module instance for the life of the process.
 */
const PANEL_READS: readonly ((store: AppStore) => Promise<unknown>)[] = [
  (store) =>
    store.dispatch(
      workspaceDashboardApi.endpoints.readDemandPressure.initiate(
        undefined,
        LOADER_QUERY_OPTIONS,
      ),
    ),
  (store) =>
    store.dispatch(
      workspaceDashboardApi.endpoints.readOrderFlow.initiate(
        undefined,
        LOADER_QUERY_OPTIONS,
      ),
    ),
  (store) =>
    store.dispatch(
      workspaceDashboardApi.endpoints.readPurchasingSpread.initiate(
        undefined,
        LOADER_QUERY_OPTIONS,
      ),
    ),
  (store) =>
    store.dispatch(
      workspaceDashboardApi.endpoints.readReceiptReliability.initiate(
        undefined,
        LOADER_QUERY_OPTIONS,
      ),
    ),
];

/**
 * The Workspace Dashboard's await window (sad.md §5): the Workspace context
 * the admitting Permission is read from, then the four Panel reads that
 * Permission admits — issued together and every one of them awaited, so the
 * destination mounts with all four figures present and no Panel paints ahead
 * of the others (`spec.md` §6 read shape, AC-14).
 *
 * **A refusal costs zero Panel requests.** `route.tsx` authenticates and stops
 * there, because AC-15 requires the denial to be rendered **at** the address
 * rather than redirected away from; so this loader runs for an actor whose
 * Workspace Role does not carry the observation Permission, and what it must
 * do then is nothing at all — a refused read that still fetches is a read.
 *
 * The Permission is read as a boolean here, in the one file that uses it,
 * because the answer feeds which reads are issued at all — the `skip` case
 * `docs/system/adr/19-08-2026-declarative-permission-gates.md` §Decision 3
 * admits. It never crosses a component boundary: the destination derives a
 * Panel's presence from the body this filled.
 *
 * AC-22 — the vocabulary is the Workspace level's and only that. A Warehouse
 * Member holding every watch Permission in their own Warehouse and no
 * Workspace Role reaches the same refusal, because authority in one Warehouse
 * says nothing about the Workspace above it.
 *
 * It imports no page and no component: `route.tsx` reaches it from the router
 * chunk, so pulling one in would defeat the lazy `import('./page')` boundary.
 */
export const loadWorkspaceDashboard = async ({
  context: { store },
}: WorkspaceDashboardLoaderInput): Promise<void> => {
  const { workspacePermissionIds } = await store
    .dispatch(
      workspaceContextApi.endpoints.getWorkspaceContext.initiate(
        undefined,
        LOADER_QUERY_OPTIONS,
      ),
    )
    .unwrap();

  if (
    !hasWorkspacePermission(
      workspacePermissionIds,
      WorkspacePermissionIdValue.WAREHOUSE_PERFORMANCE_WATCH,
    )
  ) {
    return;
  }

  await Promise.all(PANEL_READS.map((read) => read(store)));
};
