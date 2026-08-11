import i18n from 'i18n';
import { alertActionPromise } from 'shared/alerts/action-feedback';

type MutationOutcome = { data: unknown } | { error: unknown };

const alertAuthAction = async <TResult extends MutationOutcome>(
  action: 'signOut' | 'signUp',
  request: Promise<TResult>,
): Promise<TResult> =>
  alertActionPromise(request, {
    loading: i18n.t(`auth.${action}`, { ns: 'pending' }),
    success: i18n.t(`auth.${action}`, { ns: 'success' }),
  });

export const alertSignUpAction = async <TResult extends MutationOutcome>(
  request: Promise<TResult>,
): Promise<TResult> => alertAuthAction('signUp', request);

/**
 * A successful login is the documented exception to the success-toast policy,
 * so signing in reports nothing.
 */
export const alertSignInSuccess = (): void => {};

export const alertSignOutAction = async <TResult extends MutationOutcome>(
  request: Promise<TResult>,
): Promise<TResult> => alertAuthAction('signOut', request);
