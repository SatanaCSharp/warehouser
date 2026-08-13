import { useGetCurrentAccessQuery } from 'shared/api/access-permissions-api';
import { useEnteredWarehouse } from 'shared/hooks/useEnteredWarehouse';

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
  isLoading: boolean;
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
  const { data, isLoading: isAccessLoading } = useGetCurrentAccessQuery(
    warehouseId ?? '',
    { skip: warehouseId === undefined },
  );
  return {
    access: data,
    isLoading: warehouseId !== undefined && isAccessLoading,
    permissionIds: data?.permissionIds ?? [],
  };
};

export const useHasPermission = (
  permission?: PermissionId | readonly PermissionId[],
  match: PermissionMatch = 'any',
): boolean => {
  const { permissionIds } = useCurrentPermissions();
  return hasPermission(permissionIds, permission, match);
};
