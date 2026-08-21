import { PermissionId } from '@warehouser/shared-types/enums';

// The Permission sets the access surface's datasets and its Roles tab are
// admitted by, declared once so the hook that gates a read and the loader that
// reproduces that gate cannot drift apart
// (`docs/change-requests/global-loader/sad.md` §4.5, CR-RG-02).
//
// A set is a lookup table, not a capability vocabulary: every entry is a
// `PermissionId` member and nothing here derives a `canDoThing`. The gate
// itself does not live here either — `useAccessRoles` still applies its own
// `skip`, because a gate belongs to the read it gates
// (`docs/system/guides/placing-web-hooks.md` §2). This file only gives that
// gate one name to read from, which is the one thing
// `docs/system/adr/19-08-2026-declarative-permission-gates.md` §5 accepts as
// the cost of a capability that spans several surfaces: "two sites can drift".

/**
 * The Permissions that put the Roles tab on the bar; any one of them is enough.
 *
 * The tab is offered to an actor who may only read Roles as well as to one who
 * may administer them — `RolesTab` decides which of the two surfaces they get.
 *
 * This is also the Permission catalogue's read set: every actor admitted to the
 * Roles tab receives the catalogue, so **tab admission implies the dataset
 * arrives** is an identity a reader can see rather than an invariant a comment
 * claims. That identity is the reachability argument CR-RG-05 rests on.
 */
export const rolesTabPermissions: readonly PermissionId[] = [
  PermissionId.ROLES_WATCH,
  PermissionId.ROLES_ASSIGN,
  PermissionId.ROLES_CREATE,
  PermissionId.ROLES_DELETE,
  PermissionId.ROLES_UPDATE,
  PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
];

/**
 * Every actor whose surface names a Role: the Roles tab (read or administer),
 * the Members list's Role-name lookup, and Create Member's Role selection.
 */
export const rolesReadPermissions: readonly PermissionId[] = [
  PermissionId.ROLES_WATCH,
  PermissionId.ROLES_ASSIGN,
  PermissionId.ROLES_CREATE,
  PermissionId.ROLES_DELETE,
  PermissionId.ROLES_UPDATE,
  PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
  PermissionId.USERS_WATCH,
  PermissionId.USERS_CREATE,
];

/**
 * Everyone whose surface names a member: the Members list, Role assignment,
 * manager transfer, and each per-member lifecycle action.
 */
export const membersReadPermissions: readonly PermissionId[] = [
  PermissionId.USERS_WATCH,
  PermissionId.ROLES_ASSIGN,
  PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
  PermissionId.USERS_CREATE,
  PermissionId.USERS_DELETE,
  PermissionId.USERS_EMAIL_UPDATE,
  PermissionId.USERS_PASSWORD_CHANGE,
];
