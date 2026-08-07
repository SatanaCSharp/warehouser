import { ErrorCode, PermissionId } from '@warehouser/shared-types/enums';

describe('users-management Permission and Error catalogue parity', () => {
  // T1's migration (apps/server/migrations/1786025100000-GrantUsersManagementPermissions.ts)
  // inserts these exact `permissions.id` catalogue rows; PermissionId must agree byte-for-byte.
  it('gains PermissionId entries matching the granted USERS:* catalogue IDs byte-for-byte', () => {
    expect(PermissionId.USERS_EMAIL_UPDATE).toBe('USERS:EMAIL_UPDATE');
    expect(PermissionId.USERS_PASSWORD_CHANGE).toBe('USERS:PASSWORD_CHANGE');
    expect(PermissionId.USERS_DELETE).toBe('USERS:DELETE');
  });

  // docs/features/users-management/contracts/openapi.yaml's CreationUnavailable,
  // PasswordChangeUnavailable, and DeletionUnavailable response examples define these exact codes.
  it('gains ErrorCode entries matching the locked OpenAPI contract byte-for-byte', () => {
    expect(ErrorCode.USERS_CREATION_UNAVAILABLE).toBe(
      'users.creation_unavailable',
    );
    expect(ErrorCode.USERS_PASSWORD_CHANGE_UNAVAILABLE).toBe(
      'users.password_change_unavailable',
    );
    expect(ErrorCode.USERS_DELETION_UNAVAILABLE).toBe(
      'users.deletion_unavailable',
    );
  });

  // Guard against reintroducing/renaming the four codes T3 already added and verified in
  // users.errors.spec.ts — this task must not touch or duplicate them.
  it('leaves T3-authored ErrorCode entries untouched', () => {
    expect(ErrorCode.USERS_SELF_ACTION_DENIED).toBe('users.self_action_denied');
    expect(ErrorCode.USERS_MANAGER_ROLE_PROTECTED).toBe(
      'users.manager_role_protected',
    );
    expect(ErrorCode.USERS_PERMISSION_EXCEEDED).toBe(
      'users.permission_exceeded',
    );
    expect(ErrorCode.USERS_RESERVED_ROLE_SELECTION).toBe(
      'users.reserved_role_selection',
    );
  });
});
