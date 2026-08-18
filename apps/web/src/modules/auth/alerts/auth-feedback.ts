import { alertScopedAction } from 'shared/alerts/action-feedback';

import type { MutationResult } from 'shared/api/client/mutation-outcome';

export const alertSignUpAction = async <TResult extends MutationResult>(
  request: Promise<TResult>,
): Promise<TResult> => alertScopedAction('auth', 'signUp', request);

/**
 * A successful login is the documented exception to the success-toast policy,
 * so signing in reports nothing.
 */
export const alertSignInSuccess = (): void => {};

export const alertSignOutAction = async <TResult extends MutationResult>(
  request: Promise<TResult>,
): Promise<TResult> => alertScopedAction('auth', 'signOut', request);
