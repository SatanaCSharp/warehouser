import { toast } from 'shared/alerts/toast';

import type { ReactNode } from 'react';

type MutationOutcome = { data: unknown } | { error: unknown };

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
export const alertActionPromise = async <TResult extends MutationOutcome>(
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
