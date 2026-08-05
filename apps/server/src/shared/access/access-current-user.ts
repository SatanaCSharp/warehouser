import type { PermissionId } from '@warehouser/shared-types/enums';

export interface AccessCurrentUser {
  readonly userId: string;
  readonly warehouseId: string;
  readonly roleId: string;
  readonly roleKind: 'custom' | 'warehouse_manager';
  readonly permissionId: PermissionId;
}

export const accessCurrentUser = (
  value: AccessCurrentUser,
): AccessCurrentUser => Object.freeze({ ...value });
