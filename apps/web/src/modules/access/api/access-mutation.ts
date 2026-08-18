import { alertAccessAction } from 'modules/access/alerts/access-feedback';
import { runMutation } from 'shared/api/client/run-mutation';

import type { AccessSuccessAction } from 'modules/access/alerts/access-feedback';
import type {
  FieldErrorMap,
  MutationOutcome,
  MutationResult,
} from 'shared/api/client/mutation-outcome';

/**
 * Runs one access mutation behind its own action toast. Every `use…` mutation
 * hook in this module is a thin binding over this, which is itself the shared
 * `runMutation` step bound to the access feedback adapter.
 */
export const runAccessMutation = async (
  action: AccessSuccessAction,
  request: Promise<MutationResult>,
  mapFieldErrors?: FieldErrorMap,
): Promise<MutationOutcome> =>
  runMutation(
    (pending) => alertAccessAction(action, pending),
    request,
    mapFieldErrors,
  );
