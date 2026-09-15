import type { Middleware } from '@reduxjs/toolkit';
import { isFulfilled, isPending, isRejected } from '@reduxjs/toolkit';
import i18n from 'i18n';
import type { MutationFeedback } from 'shared/alerts/mutation-actions';
import { MUTATION_FEEDBACK } from 'shared/alerts/mutation-actions';
import { toast } from 'shared/alerts/toast';

type MutationLifecycleMeta = {
  arg: { endpointName?: string; originalArgs?: unknown; type?: string };
  requestId: string;
};

// The HeroUI queue has no `toastId` equivalent, so the loading toast raised on
// `pending` is remembered by the request that owns it until that request
// settles — the registry `alertApiFailure` keeps for failure codes, keyed by
// request instead, so two concurrent writes of the same endpoint each close
// their own toast.
const pendingToasts = new Map<string, ReturnType<typeof toast>>();

const mutationMetaOf = (action: unknown): MutationLifecycleMeta | undefined => {
  const meta = (action as { meta?: MutationLifecycleMeta }).meta;

  return meta?.arg?.type === 'mutation' ? meta : undefined;
};

const describeAction = (
  { action, describe, scope }: MutationFeedback,
  { arg }: MutationLifecycleMeta,
  namespace: 'pending' | 'success',
): string => {
  const name =
    typeof action === 'function'
      ? action(arg.originalArgs as never)
      : (action ?? arg.endpointName);

  return i18n.t(`${scope}.${name}`, {
    ns: namespace,
    ...describe?.(arg.originalArgs as never),
  });
};

const closePending = (requestId: string): void => {
  const pending = pendingToasts.get(requestId);
  if (pending === undefined) {
    return;
  }

  toast.close(pending);
  pendingToasts.delete(requestId);
};

/**
 * Reports every registered mutation through its promise toast: the pending
 * description while the request is in flight, replaced by the success one once
 * it commits (web-error-handling.md §4).
 *
 * Which action an endpoint reports is read from `MUTATION_FEEDBACK` by the
 * endpoint name the lifecycle action already carries, so no component and no
 * hook has to name it. A failure only closes the loading toast, because
 * `apiErrorMiddleware` owns the error toast for every normalized API failure
 * (§2) and raising one here would report the same failure twice.
 */
export const mutationFeedbackMiddleware: Middleware =
  () => (next) => (action) => {
    const meta = mutationMetaOf(action);
    const feedback = meta && MUTATION_FEEDBACK[meta.arg.endpointName ?? ''];

    if (!meta || !feedback) {
      return next(action);
    }

    if (isPending(action)) {
      pendingToasts.set(
        meta.requestId,
        toast(describeAction(feedback, meta, 'pending'), {
          isLoading: true,
          timeout: 0,
        }),
      );
    }

    if (isFulfilled(action)) {
      closePending(meta.requestId);
      toast.success(describeAction(feedback, meta, 'success'));
    }

    if (isRejected(action)) {
      closePending(meta.requestId);
    }

    return next(action);
  };
