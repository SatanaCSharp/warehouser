import { accessApi } from 'modules/access/api/access-api';
import {
  membersReadPermissions,
  rolesReadPermissions,
  rolesTabPermissions,
} from 'modules/access/utils/access-permission-sets';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import { hasPermission } from 'shared/hooks/queries/usePermissions';

import type { PermissionId } from '@warehouser/shared-types/enums';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type { RouterContext } from 'routes/__root.route';
import type { AppStore } from 'store';

/**
 * The router context inside `accessRoute`: the application context every route
 * carries, plus the entry verdict `warehouseRoute.beforeLoad` publishes into
 * the Warehouse layout match.
 */
export type AccessSurfaceContext = RouterContext & WarehouseEntryVerdict;

export type AccessSurfaceLoaderInput = {
  context: AccessSurfaceContext;
};

/**
 * A loader-filled entry holds no subscriber of its own, exactly as
 * `guards/workspace.guard.ts` and `guards/warehouse-entry.guard.ts` dispatch.
 * The force-mounted panel's own query hook is what retains it for the
 * destination's lifetime (sad.md §4.4).
 */
const LOADER_QUERY_OPTIONS = { subscribe: false } as const;

type GatedDataset = {
  dispatch: () => Promise<unknown>;
  permissions: readonly PermissionId[];
};

/**
 * The three tab datasets, each beside the Permission set that admits it — the
 * same set the dataset's own hook names in its `skip`, read from the one place
 * that declares it, so the loader and the hook cannot disagree (CR-RG-02,
 * sad.md §4.5): `useAccessRoles` for the Roles read, `useAccessMembers` for the
 * Members read, and `useAccessPermissions` for the Permission catalogue, whose
 * set is the Roles tab's own admission set.
 *
 * Each dispatch is a deferred factory rather than a started request: nothing
 * may be issued until the projection above has resolved and the filter below
 * has selected it (§4.3).
 */
const gatedDatasets = (
  store: AppStore,
  warehouseId: string,
): readonly GatedDataset[] => [
  {
    dispatch: () =>
      store.dispatch(
        accessApi.endpoints.listAccessRoles.initiate(
          warehouseId,
          LOADER_QUERY_OPTIONS,
        ),
      ),
    permissions: rolesReadPermissions,
  },
  {
    dispatch: () =>
      store.dispatch(
        accessApi.endpoints.listAccessMembers.initiate(
          warehouseId,
          LOADER_QUERY_OPTIONS,
        ),
      ),
    permissions: membersReadPermissions,
  },
  {
    dispatch: () =>
      store.dispatch(
        accessApi.endpoints.listAccessPermissions.initiate(
          warehouseId,
          LOADER_QUERY_OPTIONS,
        ),
      ),
    permissions: rolesTabPermissions,
  },
];

/**
 * `accessRoute`'s await window: the verdict gate, the projection every skip set
 * is derived from, and the tab datasets that projection admits
 * (ADR 0001, sad.md §4.3, §5.5).
 *
 * **The gate comes first, and it issues nothing.** `warehouseRoute.beforeLoad`
 * _returns_ a refusal verdict rather than throwing, so this loader still runs
 * on an address the actor was just refused. Anything other than an `entered`
 * verdict returns immediately: not `getCurrentAccess`, not any dataset, so the
 * request count around a refusal stays at `baseline_revision`, which is zero
 * (CH-16, CR-AC-14). It reads the verdict the guard already published and never
 * re-derives one — that stays in `guards/`.
 *
 * **Then two rounds, deliberately.** Every access skip set is derived from the
 * projection's `permissionIds`, so the projection must resolve before the tab
 * datasets can be selected, and CR-RG-02 forbids flattening that by fetching
 * unconditionally. Two rounds is the accepted cost; a third would fail
 * `spec.md` §6 row 2.
 *
 *  1. The projection is awaited **unwrapped**, with the identical argument
 *     `useEnteredWarehouse()` supplies to `useCurrentPermissions`, so
 *     `AccessPage` reads the entry this filled rather than opening a second one
 *     (CR-AC-04). A rejection propagates out of the loader and
 *     `RouteErrorState` replaces the destination (CR-AC-15).
 *  2. The admitted datasets go out in one `Promise.allSettled` round, which
 *     bounds the wait by the slowest of them rather than their sum and absorbs
 *     a rejection: the destination paints and that tab renders its own error
 *     message through the error arm CH-14 preserved (CR-AC-15). The failed
 *     entry is already in the cache with `isError: true`, which is why
 *     `AccessDataset.isError` survives CH-09.
 *
 * It imports no page and no component: `route.tsx` reaches it from the router
 * chunk, so pulling one in would defeat the lazy `import('./page')` boundary.
 */
export const loadAccessSurface = async ({
  context,
}: AccessSurfaceLoaderInput): Promise<void> => {
  if (context.status !== 'entered') {
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

  await Promise.allSettled(
    gatedDatasets(store, warehouseId)
      .filter(({ permissions }) =>
        hasPermission(access.permissionIds, permissions),
      )
      .map(({ dispatch }) => dispatch()),
  );
};
