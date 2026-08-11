import { PermissionId } from '@warehouser/shared-types/enums';
import mapValues from 'lodash/mapValues';

import { hasPermission } from 'shared/hooks/usePermissions';

/**
 * What the acting user may do in the access workspace, and the Permissions that
 * grant each capability. Widening a capability is an edit to this table — no
 * tab, panel, or query re-checks a raw Permission id.
 */
const capabilityPermissions = {
  canAssignRoles: [
    PermissionId.ROLES_ASSIGN,
    PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
  ],
  canCreateMembers: [PermissionId.USERS_CREATE],
  canManageMemberLifecycle: [
    PermissionId.USERS_CREATE,
    PermissionId.USERS_DELETE,
    PermissionId.USERS_EMAIL_UPDATE,
    PermissionId.USERS_PASSWORD_CHANGE,
  ],
  canManageRoles: [
    PermissionId.ROLES_ASSIGN,
    PermissionId.ROLES_CREATE,
    PermissionId.ROLES_DELETE,
    PermissionId.ROLES_UPDATE,
    PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
  ],
  canReadMembers: [PermissionId.USERS_WATCH],
  canReadPermissions: [
    PermissionId.ROLES_CREATE,
    PermissionId.ROLES_UPDATE,
    PermissionId.ROLES_WATCH,
  ],
  canReadRoles: [PermissionId.ROLES_WATCH],
} satisfies Record<string, readonly PermissionId[]>;

export type AccessCapabilities = Record<
  keyof typeof capabilityPermissions,
  boolean
>;

/** Holding any one of a capability's Permissions grants that capability. */
export const deriveAccessCapabilities = (
  permissionIds: readonly string[],
): AccessCapabilities =>
  mapValues(capabilityPermissions, (granting) =>
    hasPermission(permissionIds, granting),
  );
