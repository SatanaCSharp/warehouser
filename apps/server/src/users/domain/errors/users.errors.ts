import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';

export const selfActionDeniedError = (): ApplicationError =>
  new ApplicationError(ErrorCode.USERS_SELF_ACTION_DENIED);
export const managerRoleProtectedError = (): ApplicationError =>
  new ApplicationError(ErrorCode.USERS_MANAGER_ROLE_PROTECTED);
export const permissionExceededError = (): ApplicationError =>
  new ApplicationError(ErrorCode.USERS_PERMISSION_EXCEEDED);
export const reservedRoleSelectionError = (): ApplicationError =>
  new ApplicationError(ErrorCode.USERS_RESERVED_ROLE_SELECTION);

// AC-02/AC-05 reuse `auth`'s registration-time credential rules and stable
// error codes verbatim (spec.md §5 note; ADR-0001). They are declared here, in
// the module that raises them, rather than imported from `auth/domain/errors/*`
// — those factories are `auth`-owned, and a cross-module import of another
// module's errors is what `server-architecture.md` forbids. Declaring them once
// per module, not once per command, is the part this consolidates.
export const invalidInputError = (
  fields?: Readonly<Record<string, string>>,
): ApplicationError =>
  new ApplicationError(
    ErrorCode.AUTH_INVALID_INPUT,
    fields ? { fields } : undefined,
  );

export const emailAlreadyRegisteredError = (): ApplicationError =>
  new ApplicationError(ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED);
