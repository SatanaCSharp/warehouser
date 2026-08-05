import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';

export const accessDeniedError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_DENIED);
export const membershipRequiredError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_MEMBERSHIP_REQUIRED);
export const invalidRoleError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_INVALID_ROLE);
export const roleNameConflictError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_ROLE_NAME_CONFLICT);
export const roleUnavailableError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_ROLE_UNAVAILABLE);
export const targetUnavailableError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_TARGET_UNAVAILABLE);
export const protectedRoleError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_PROTECTED_ROLE);
export const managerTransferRequiredError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_MANAGER_TRANSFER_REQUIRED);
export const replacementRequiredError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_REPLACEMENT_REQUIRED);
export const invalidManagerTransferError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_INVALID_MANAGER_TRANSFER);
export const concurrentAccessChangeError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_CONCURRENT_CHANGE);
