export class AuthInvalidInputError extends Error {
  readonly code = 'auth.invalid_input';
}

export class AuthEmailAlreadyRegisteredError extends Error {
  readonly code = 'auth.email_already_registered';
}

export class AuthInvalidCredentialsError extends Error {
  readonly code = 'auth.invalid_credentials';
}

export class AuthRegistrationUnavailableError extends Error {
  readonly code = 'auth.registration_unavailable';
}

export class AuthSessionUnavailableError extends Error {
  readonly code = 'auth.session_unavailable';
}

export class AuthSignOutUnavailableError extends Error {
  readonly code = 'auth.sign_out_unavailable';
}
