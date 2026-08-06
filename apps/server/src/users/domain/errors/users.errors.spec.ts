import { ErrorCode } from '@warehouser/shared-types/enums';
import {
  permissionExceededTargetError,
  protectedManagerTargetError,
  reservedRoleSelectionError,
  selfActionForbiddenError,
} from 'users/domain/errors/users.errors';

describe('users domain error factories', () => {
  // AC-11 / AC-18 (self-action)
  it('builds a stable, code-carrying error for a self-action attempt', () => {
    expect(selfActionForbiddenError()).toMatchObject({
      code: ErrorCode.USERS_SELF_ACTION_FORBIDDEN,
    });
  });

  // AC-13 / AC-14 (protected Warehouse Manager target)
  it('builds a stable, code-carrying error for a protected Manager target', () => {
    expect(protectedManagerTargetError()).toMatchObject({
      code: ErrorCode.USERS_PROTECTED_MANAGER_TARGET,
    });
  });

  // AC-16 / AC-19 (Permission-exceeded target, both directions)
  it('builds a stable, code-carrying error for a Permission-exceeded target', () => {
    expect(permissionExceededTargetError()).toMatchObject({
      code: ErrorCode.USERS_PERMISSION_EXCEEDED_TARGET,
    });
  });

  // AC-20 (reserved Warehouse Manager Role selection)
  it('builds a stable, code-carrying error for a reserved-Role selection', () => {
    expect(reservedRoleSelectionError()).toMatchObject({
      code: ErrorCode.USERS_RESERVED_ROLE_SELECTION,
    });
  });
});
