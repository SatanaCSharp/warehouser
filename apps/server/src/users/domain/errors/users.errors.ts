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
