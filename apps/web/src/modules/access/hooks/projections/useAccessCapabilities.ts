import { PermissionId } from '@warehouser/shared-types/enums';
import mapValues from 'lodash/mapValues';

import {
  hasPermission,
  useCurrentPermissions,
} from 'shared/hooks/queries/usePermissions';

/**
 * What the acting user may do in the access workspace, and the Permissions that
 * grant each capability. Widening a capability is an edit to this table — no
 * tab, panel, dialog, or query re-checks a raw Permission id.
 */
const capabilityPermissions = {
  canAssignRoles: [PermissionId.ROLES_ASSIGN],
  canCreateMembers: [PermissionId.USERS_CREATE],
  canCreateRoles: [PermissionId.ROLES_CREATE],
  canDeleteMembers: [PermissionId.USERS_DELETE],
  canDeleteRoles: [PermissionId.ROLES_DELETE],
  canEditMemberEmails: [PermissionId.USERS_EMAIL_UPDATE],
  canReadMembers: [PermissionId.USERS_WATCH],
  canReadPermissions: [
    PermissionId.ROLES_CREATE,
    PermissionId.ROLES_UPDATE,
    PermissionId.ROLES_WATCH,
  ],
  canReadRoles: [PermissionId.ROLES_WATCH],
  canResetMemberPasswords: [PermissionId.USERS_PASSWORD_CHANGE],
  canTransferManager: [PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN],
  canUpdateRoles: [PermissionId.ROLES_UPDATE],
} satisfies Record<string, readonly PermissionId[]>;

type GrantedCapabilities = Record<keyof typeof capabilityPermissions, boolean>;

/** The two rollups the workspace reads; both follow from the table above. */
type ComposedCapabilities = {
  /** Any Role administration at all — the Roles tab's editable surface. */
  canManageRoles: boolean;
  /** Any per-member lifecycle action — the Members tab's row actions. */
  canManageMemberLifecycle: boolean;
};

type GrantedAndComposedCapabilities = GrantedCapabilities &
  ComposedCapabilities;

export type AccessCapabilities = GrantedAndComposedCapabilities & {
  /** Whether the Warehouse the projection was read from is archived (AC-12). */
  isArchived: boolean;
  /** The Warehouse the current capability projection was read from. */
  warehouseId: string | undefined;
};

/** Holding any one of a capability's Permissions grants that capability. */
const deriveAccessCapabilities = (
  permissionIds: readonly string[],
): GrantedAndComposedCapabilities => {
  const granted = mapValues(capabilityPermissions, (granting) =>
    hasPermission(permissionIds, granting),
  );

  return {
    ...granted,
    canManageRoles:
      granted.canAssignRoles ||
      granted.canCreateRoles ||
      granted.canDeleteRoles ||
      granted.canUpdateRoles ||
      granted.canTransferManager,
    canManageMemberLifecycle:
      granted.canCreateMembers ||
      granted.canDeleteMembers ||
      granted.canEditMemberEmails ||
      granted.canResetMemberPasswords,
  };
};

/**
 * What the acting user may do right now, read from the cached current-access
 * projection. Components call this where they gate a control instead of being
 * handed Permission ids from an ancestor, so a refreshed projection narrows
 * every gate at once.
 */
export const useAccessCapabilities = (): AccessCapabilities => {
  const { access, permissionIds } = useCurrentPermissions();
  return {
    ...deriveAccessCapabilities(permissionIds),
    isArchived: access !== undefined && access.archivedAt !== null,
    warehouseId: access?.warehouseId,
  };
};
