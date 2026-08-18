import i18n from 'i18n';
import { toast } from 'shared/alerts/toast';

import type { ReactNode } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

export interface ActionToastMessages {
  loading: ReactNode;
  success: ReactNode;
}

/**
 * Runs an asynchronous action behind a promise toast: a loading toast stays on
 * screen for as long as the request is in flight and is replaced by the success
 * description once the result carries `data`.
 *
 * A failed result only closes the loading toast. `apiErrorMiddleware` owns the
 * error toast for every normalized API failure (see `web-error-handling.md` §2),
 * so raising `toast.danger` here would report the same failure twice.
 */
export const alertActionPromise = async <TResult extends MutationResult>(
  action: Promise<TResult>,
  messages: ActionToastMessages,
): Promise<TResult> => {
  const pendingKey = toast(messages.loading, { isLoading: true, timeout: 0 });

  try {
    const result = await action;
    toast.close(pendingKey);

    if (!('error' in result)) {
      toast.success(messages.success);
    }

    return result;
  } catch (error) {
    toast.close(pendingKey);
    throw error;
  }
};

/**
 * Reports one scoped action through the promise toast above: the pending
 * description of `<scope>.<action>` while the request runs, then the matching
 * success description once the workflow completed.
 *
 * Every feedback adapter — access, auth, workspace — names its own scope and
 * its own action union and reaches this for the rest, so the pending/success
 * namespace pairing is declared once rather than per module.
 *
 * @param params interpolates the outcome's subject, such as the Warehouse name,
 * so the success toast names what committed rather than only naming the action.
 */
export const alertScopedAction = async <TResult extends MutationResult>(
  scope: string,
  action: string,
  request: Promise<TResult>,
  params?: Record<string, unknown>,
): Promise<TResult> =>
  alertActionPromise(request, {
    loading: i18n.t(`${scope}.${action}`, { ns: 'pending', ...params }),
    success: i18n.t(`${scope}.${action}`, { ns: 'success', ...params }),
  });
