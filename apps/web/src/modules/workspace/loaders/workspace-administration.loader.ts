import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { WorkspacePermissionId as WorkspacePermissionIdValue } from '@warehouser/shared-types/enums';
import { loadWorkspaceAdministrationAccessDatasets } from 'modules/access/loaders/workspace-administration-datasets.loader';
import { workspaceWarehousesApi } from 'modules/workspace/api/warehouse-api';
import type { RouterContext } from 'routes/__root.route';
import { workspaceContextApi } from 'shared/api/workspace/workspace-context-api';
import { workspaceUsersApi } from 'shared/api/workspace/workspace-users-api';
import { hasWorkspacePermission } from 'shared/hooks/queries/useWorkspacePermissions';
import type { AppStore } from 'store';

export type WorkspaceAdministrationLoaderInput = { context: RouterContext };

type GatedDataset = {
  dispatch: () => Promise<unknown>;
  permission: WorkspacePermissionId;
};

/**
 * A loader-filled entry holds no subscriber of its own, exactly as
 * `guards/workspace.guard.ts` dispatches. The force-mounted panel's own query
 * hook is what retains it for the destination's lifetime (sad.md §4.4).
 */
const LOADER_QUERY_OPTIONS = { subscribe: false } as const;

/**
 * The two Workspace-administration datasets `modules/workspace` owns, each
 * beside the Workspace Permission that admits it (sad.md §5.5, CR-RG-02):
 *
 * - `listWorkspaceWarehouses` is gated by the Warehouses **tab descriptor**'s
 *   `WAREHOUSES:WATCH` (`WorkspaceAdministration.tsx`), not by a hook `skip` —
 *   `WarehousesTab` reads it ungated, because reaching the tab is the gate.
 * - `listWorkspaceUsers` is gated by `WORKSPACE_MEMBERS:WATCH` and dispatched
 *   **once**: one cache entry serves both the Warehouses tab's people counts
 *   and `useWorkspaceUsers`'s candidate list (sad.md §5.4).
 */
const gatedDatasets = (store: AppStore): readonly GatedDataset[] => [
  {
    dispatch: () =>
      store.dispatch(
        workspaceWarehousesApi.endpoints.listWorkspaceWarehouses.initiate(
          undefined,
          LOADER_QUERY_OPTIONS,
        ),
      ),
    permission: WorkspacePermissionIdValue.WAREHOUSES_WATCH,
  },
  {
    dispatch: () =>
      store.dispatch(
        workspaceUsersApi.endpoints.listWorkspaceUsers.initiate(
          undefined,
          LOADER_QUERY_OPTIONS,
        ),
      ),
    permission: WorkspacePermissionIdValue.WORKSPACE_MEMBERS_WATCH,
  },
];

/**
 * `/workspace`'s route loader: the destination's first-paint readiness is the
 * route's, so every dataset the actor's admitted surfaces would fetch is
 * awaited here rather than after the page mounts (CH-03, CR-AC-03).
 *
 * Two phases, with no per-dataset error handling (sad.md §4.2):
 *
 * 1. **Primary** — `getWorkspaceContext`, unwrapped. A rejection propagates out
 *    of the loader and reaches `RouteErrorState` (CR-AC-15).
 *    `requireWorkspaceCapability` has already awaited it in `beforeLoad`, so
 *    this resolves from that cache entry without a second request (§4.3).
 * 2. **Secondary** — one `Promise.allSettled` round over every admitted
 *    dataset, this module's two composed with the three `modules/access`
 *    contributes through its declared surface (ADR 0001, sad.md §5.4).
 *    `allSettled` **is** the settle semantics: no `catch` per dataset, nothing
 *    swallowed silently, and a failed entry is already in the cache with
 *    `isError: true` for the tab's own error arm to render (CR-AC-15). It also
 *    bounds the wait by the slowest admitted dataset rather than their sum,
 *    which is `spec.md` §6 row 1's target.
 *
 * An actor holding only `WORKSPACE:RENAME` is admitted to the destination and
 * to no tab, so nothing secondary is awaited at all (CR-AC-03).
 *
 * It imports no page and no component: `route.tsx` reaches it from the router
 * chunk, so pulling one in would defeat the lazy `import('./page')` boundary.
 */
export const loadWorkspaceAdministration = async ({
  context: { store },
}: WorkspaceAdministrationLoaderInput): Promise<void> => {
  const { workspacePermissionIds } = await store
    .dispatch(
      workspaceContextApi.endpoints.getWorkspaceContext.initiate(
        undefined,
        LOADER_QUERY_OPTIONS,
      ),
    )
    .unwrap();

  await Promise.allSettled([
    ...gatedDatasets(store)
      .filter(({ permission }) =>
        hasWorkspacePermission(workspacePermissionIds, permission),
      )
      .map(({ dispatch }) => dispatch()),
    ...loadWorkspaceAdministrationAccessDatasets({
      store,
      workspacePermissionIds,
    }),
  ]);
};
