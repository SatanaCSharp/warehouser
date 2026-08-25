import { ErrorCode } from '@warehouser/shared-types/enums';
import {
  emailAlreadyRegisteredError,
  invalidInputError,
  managerRoleProtectedError,
  permissionExceededError,
  reservedRoleSelectionError,
  selfActionDeniedError,
} from 'users/domain/errors/users.errors';

describe('users domain error factories', () => {
  // AC-11 / AC-18 (self-action)
  it('builds a stable, code-carrying error for a self-action attempt', () => {
    expect(selfActionDeniedError()).toMatchObject({
      code: ErrorCode.USERS_SELF_ACTION_DENIED,
    });
  });

  // AC-13 / AC-14 (protected Warehouse Manager target)
  it('builds a stable, code-carrying error for a protected Manager target', () => {
    expect(managerRoleProtectedError()).toMatchObject({
      code: ErrorCode.USERS_MANAGER_ROLE_PROTECTED,
    });
  });

  // AC-16 / AC-19 (Permission-exceeded target, both directions)
  it('builds a stable, code-carrying error for a Permission-exceeded target', () => {
    expect(permissionExceededError()).toMatchObject({
      code: ErrorCode.USERS_PERMISSION_EXCEEDED,
    });
  });

  // AC-20 (reserved Warehouse Manager Role selection)
  it('builds a stable, code-carrying error for a reserved-Role selection', () => {
    expect(reservedRoleSelectionError()).toMatchObject({
      code: ErrorCode.USERS_RESERVED_ROLE_SELECTION,
    });
  });

  // AC-02 / AC-05 / AC-07 — the two factories this module declares for the
  // `auth` credential rules it reuses verbatim. They were declared once per
  // command until they were consolidated here, so their codes are pinned in
  // one place rather than in each command's own spec.
  it('names the invalid field on a rejected credential', () => {
    expect(invalidInputError({ email: 'unsupported' })).toMatchObject({
      code: ErrorCode.AUTH_INVALID_INPUT,
      details: { fields: { email: 'unsupported' } },
    });
  });

  it('omits details when no field is named', () => {
    expect(invalidInputError()).toMatchObject({
      code: ErrorCode.AUTH_INVALID_INPUT,
    });
  });

  it('builds a stable, code-carrying error for an already-registered email', () => {
    expect(emailAlreadyRegisteredError()).toMatchObject({
      code: ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED,
    });
  });
});
