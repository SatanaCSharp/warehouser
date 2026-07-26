import type { ApiFailure } from 'shared/api/api-client';

const errorTranslationKeys: Record<string, string> = {
  'api.network': 'errors.api.network',
  'api.unexpected': 'errors.api.unexpected',
  'auth.email_already_registered': 'errors.auth.emailAlreadyRegistered',
  'auth.invalid_credentials': 'errors.auth.invalidCredentials',
  'auth.invalid_input': 'errors.auth.invalidInput',
  'auth.registration_unavailable': 'errors.auth.registrationUnavailable',
  'auth.session_unavailable': 'errors.auth.sessionUnavailable',
  'auth.sign_out_unavailable': 'errors.auth.signOutUnavailable',
};

const fieldErrorCodes = new Set([
  'validation.email.invalid',
  'validation.email.required',
  'validation.password.length',
  'validation.password.required',
]);

export const getTranslatedApiError = (
  error: ApiFailure,
  translate: (key: string) => string,
): string =>
  translate(errorTranslationKeys[error.code] ?? 'errors.api.unexpected');

export const getFieldErrors = (error: ApiFailure): Record<string, string> =>
  Object.fromEntries(
    Object.entries(error.fieldErrors ?? {}).filter(
      ([field, code]) =>
        (field === 'email' || field === 'password') &&
        fieldErrorCodes.has(code),
    ),
  );
