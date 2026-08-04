import type { PermissionId } from '@warehouser/shared-types/enums';

export interface AccessPrincipal {
  readonly userId: string;
  readonly warehouseId: string;
  readonly roleId: string;
  readonly roleKind: 'custom' | 'warehouse_manager';
  readonly permissionId: PermissionId;
}

export const accessPrincipal = (value: AccessPrincipal): AccessPrincipal =>
  Object.freeze({ ...value });
