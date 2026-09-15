import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError, SystemError } from '@warehouser/shared-types/errors';
import { isDefined } from '@warehouser/utils/predicates';

export const AuthInvalidInputError = (
  fields?: Readonly<Record<string, string>>,
): ApplicationError =>
  new ApplicationError(
    ErrorCode.AUTH_INVALID_INPUT,
    isDefined(fields) ? { fields } : undefined,
  );

export const AuthEmailAlreadyRegisteredError = (): ApplicationError =>
  new ApplicationError(ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED);

export const AuthInvalidCredentialsError = (): ApplicationError =>
  new ApplicationError(ErrorCode.AUTH_INVALID_CREDENTIALS);

export const AuthRegistrationUnavailableError = (cause: unknown): SystemError =>
  new SystemError(ErrorCode.AUTH_REGISTRATION_UNAVAILABLE, cause);
