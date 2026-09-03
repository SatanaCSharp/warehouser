import type { PermissionId } from '@warehouser/shared-types/enums';

export interface AccessCurrentUser {
  readonly userId: string;
  readonly warehouseId: string;
  readonly roleId: string;
  readonly roleKind: 'custom' | 'warehouse_manager';
  readonly permissionId: PermissionId;
  /** The subset of the Permissions the handler declared with `@ObservedPermission` that the acting
   * membership actually grants — empty when the handler declared none (AC-09a, ADR 0001).
   *
   * It is a projection input, never an admission input: the guard resolved it after the required
   * Permission had already admitted the request, and a query narrows what it selects by it. It is
   * server-side only and, like the rest of this principal, never returned to the browser. */
  readonly observedPermissionIds: readonly PermissionId[];
  readonly archived: boolean;
}

export const accessCurrentUser = (
  value: AccessCurrentUser,
): AccessCurrentUser =>
  Object.freeze({
    ...value,
    observedPermissionIds: Object.freeze([...value.observedPermissionIds]),
  });
