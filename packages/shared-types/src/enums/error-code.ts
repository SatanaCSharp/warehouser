export const ErrorCode = {
  AUTH_INVALID_INPUT: 'auth.invalid_input',
  AUTH_EMAIL_ALREADY_REGISTERED: 'auth.email_already_registered',
  AUTH_INVALID_CREDENTIALS: 'auth.invalid_credentials',
  AUTH_REGISTRATION_UNAVAILABLE: 'auth.registration_unavailable',
  AUTH_SESSION_UNAVAILABLE: 'auth.session_unavailable',
  AUTH_SIGN_OUT_UNAVAILABLE: 'auth.sign_out_unavailable',
  ACCESS_DENIED: 'access.denied',
  INTERNAL_ERROR: 'system.internal_error',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
