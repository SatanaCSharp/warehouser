import { useGetCurrentAccessQuery } from 'shared/api/access/access-permissions-api';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type { AccessProjection } from '@warehouser/contracts/access';
import type { PermissionId } from '@warehouser/shared-types/enums';

export type PermissionMatch = 'all' | 'any';

export const hasPermission = (
  permissionIds: readonly string[],
  permission?: PermissionId | readonly PermissionId[],
  match: PermissionMatch = 'any',
): boolean => {
  if (permission === undefined) {
    return permissionIds.length > 0;
  }
  const required: readonly PermissionId[] = Array.isArray(permission)
    ? permission
    : [permission];

  return match === 'all'
    ? required.every((id) => permissionIds.includes(id))
    : required.some((id) => permissionIds.includes(id));
};

export type CurrentPermissions = {
  access: AccessProjection | undefined;
  permissionIds: readonly string[];
};

// T6 / CR-AC-06 — the Warehouse a surface operates on is the one its address
// names, never the actor's stored selection. `useEnteredWarehouse()` yields an
// id only inside an *entered* Warehouse match, so outside a Warehouse view and
// around a refusal this hook holds no authority and issues no projection read —
// the same shape it had for a null selection before, now decided by the
// address. Changing the stored selection therefore cannot change what an
// already-open address shows.
export const useCurrentPermissions = (): CurrentPermissions => {
  const warehouseId = useEnteredWarehouse();
  // T10 / CR-AC-19 — `currentData`, never `data`. RTK Query's `data` is the
  // last successful result this hook instance saw for ANY argument, so while
  // W2's projection is in flight it still reports W1's authority — exactly the
  // cross-Warehouse leak CH-04 exists to remove. `currentData` is scoped to the
  // current argument, so the answer is simply absent until the addressed
  // Warehouse's own projection arrives: no skeleton, no placeholder, and no
  // held-over value from the Warehouse just left.
  //
  // T16 / CH-09 — `isLoading` is gone from the contract (CR-AC-09); the route
  // loader awaits this projection before the destination paints, so no caller
  // has a waiting state left to render. The `currentData` read below is NOT
  // part of that removal (CR-RG-03).
  const { currentData } = useGetCurrentAccessQuery(warehouseId ?? '', {
    skip: warehouseId === undefined,
  });
  return {
    access: currentData,
    permissionIds: currentData?.permissionIds ?? [],
  };
};

export const useHasPermission = (
  permission?: PermissionId | readonly PermissionId[],
  match: PermissionMatch = 'any',
): boolean => {
  const { permissionIds } = useCurrentPermissions();
  return hasPermission(permissionIds, permission, match);
};
