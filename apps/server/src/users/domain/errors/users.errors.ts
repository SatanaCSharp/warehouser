import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';

export const selfActionForbiddenError = (): ApplicationError =>
  new ApplicationError(ErrorCode.USERS_SELF_ACTION_FORBIDDEN);
export const protectedManagerTargetError = (): ApplicationError =>
  new ApplicationError(ErrorCode.USERS_PROTECTED_MANAGER_TARGET);
export const permissionExceededTargetError = (): ApplicationError =>
  new ApplicationError(ErrorCode.USERS_PERMISSION_EXCEEDED_TARGET);
export const reservedRoleSelectionError = (): ApplicationError =>
  new ApplicationError(ErrorCode.USERS_RESERVED_ROLE_SELECTION);
