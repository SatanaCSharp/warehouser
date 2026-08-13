import { useGetCurrentAccessQuery } from 'shared/api/access-permissions-api';
import { useGetWorkspaceContextQuery } from 'shared/api/workspace-context-api';

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

export const useCurrentPermissions = (): CurrentPermissions => {
  const { data: context, isLoading: isContextLoading } =
    useGetWorkspaceContextQuery();
  const warehouseId = context?.effectiveWarehouseId ?? undefined;
  const { data, isLoading: isAccessLoading } = useGetCurrentAccessQuery(
    warehouseId ?? '',
    { skip: warehouseId === undefined },
  );
  return {
    access: data,
    isLoading:
      isContextLoading || (warehouseId !== undefined && isAccessLoading),
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
