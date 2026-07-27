import type { ApiFailure } from 'shared/api/api-client';

export type ErrorTranslationKey =
  | 'api.network'
  | 'api.unexpected'
  | 'auth.emailAlreadyRegistered'
  | 'auth.invalidCredentials'
  | 'auth.invalidInput'
  | 'auth.registrationUnavailable'
  | 'auth.sessionUnavailable'
  | 'auth.signOutUnavailable';

const errorTranslationKeys: Record<string, ErrorTranslationKey> = {
  'api.network': 'api.network',
  'api.unexpected': 'api.unexpected',
  'auth.email_already_registered': 'auth.emailAlreadyRegistered',
  'auth.invalid_credentials': 'auth.invalidCredentials',
  'auth.invalid_input': 'auth.invalidInput',
  'auth.registration_unavailable': 'auth.registrationUnavailable',
  'auth.session_unavailable': 'auth.sessionUnavailable',
  'auth.sign_out_unavailable': 'auth.signOutUnavailable',
};

const fieldErrorCodes = new Set([
  'validation.email.invalid',
  'validation.email.required',
  'validation.password.length',
  'validation.password.required',
]);

export const getTranslatedApiError = (
  error: ApiFailure,
  translate: (key: ErrorTranslationKey) => string,
): string => translate(errorTranslationKeys[error.code] ?? 'api.unexpected');

export const getFieldErrors = (error: ApiFailure): Record<string, string> =>
  Object.fromEntries(
    Object.entries(error.fieldErrors ?? {}).filter(
      ([field, code]) =>
        (field === 'email' || field === 'password') &&
        fieldErrorCodes.has(code),
    ),
  );
