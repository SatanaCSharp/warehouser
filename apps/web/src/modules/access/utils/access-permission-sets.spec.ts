import type { PermissionId as PermissionIdValue } from '@warehouser/shared-types/enums';
import { PermissionId } from '@warehouser/shared-types/enums';
import {
  membersReadPermissions,
  rolesReadPermissions,
  rolesTabPermissions,
} from 'modules/access/utils/access-permission-sets';
import { describe, expect, it } from 'vitest';

// RED for T2 / CR-RG-02 — the loaders become a second place a Permission
// decides a request, so each set is declared once and both the hook and the
// loader read it (`sad.md` §4.5). This spec is the membership record: it fails
// on any drift in either direction, and it is the file that records which of
// the three sets this request is permitted to move.
//
// `rolesTabPermissions` is also `useAccessPermissions`' skip set from this
// change on — the one intended widening CR-RG-02 enumerates — so a
// `ROLES:ASSIGN`-only actor, admitted to the Roles tab, is now inside the
// catalogue's set too. The other two sets change membership by nothing.
const asSorted = (
  permissions: readonly PermissionIdValue[],
): PermissionIdValue[] => [...permissions].sort();

describe('access permission sets', () => {
  it('admits the six Permissions that put the Roles tab on the bar', () => {
    expect(asSorted(rolesTabPermissions)).toEqual(
      asSorted([
        PermissionId.ROLES_WATCH,
        PermissionId.ROLES_ASSIGN,
        PermissionId.ROLES_CREATE,
        PermissionId.ROLES_DELETE,
        PermissionId.ROLES_UPDATE,
        PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
      ]),
    );
  });

  it('widens the catalogue set by ROLES:ASSIGN, ROLES:DELETE and WAREHOUSE_MANAGER_ROLE:REASSIGN and nothing else', () => {
    // The `baseline_revision` catalogue set (`useAccessPermissions.ts:12-16`)
    // is a strict subset, so the change is a widening, never a replacement.
    expect(rolesTabPermissions).toEqual(
      expect.arrayContaining([
        PermissionId.ROLES_WATCH,
        PermissionId.ROLES_CREATE,
        PermissionId.ROLES_UPDATE,
      ]),
    );
    expect(rolesTabPermissions).toEqual(
      expect.arrayContaining([
        PermissionId.ROLES_ASSIGN,
        PermissionId.ROLES_DELETE,
        PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
      ]),
    );
    expect(rolesTabPermissions).toHaveLength(6);
  });

  it('leaves the Roles read set at its eight baseline Permissions', () => {
    expect(asSorted(rolesReadPermissions)).toEqual(
      asSorted([
        PermissionId.ROLES_WATCH,
        PermissionId.ROLES_ASSIGN,
        PermissionId.ROLES_CREATE,
        PermissionId.ROLES_DELETE,
        PermissionId.ROLES_UPDATE,
        PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
        PermissionId.USERS_WATCH,
        PermissionId.USERS_CREATE,
      ]),
    );
  });

  it('leaves the Members read set at its seven baseline Permissions', () => {
    expect(asSorted(membersReadPermissions)).toEqual(
      asSorted([
        PermissionId.USERS_WATCH,
        PermissionId.ROLES_ASSIGN,
        PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
        PermissionId.USERS_CREATE,
        PermissionId.USERS_DELETE,
        PermissionId.USERS_EMAIL_UPDATE,
        PermissionId.USERS_PASSWORD_CHANGE,
      ]),
    );
  });
});
