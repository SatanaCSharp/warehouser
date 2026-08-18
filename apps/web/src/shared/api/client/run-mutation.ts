import { isApiFailure } from 'shared/api/client/api-client';

import type {
  FieldErrorMap,
  MutationOutcome,
  MutationResult,
} from 'shared/api/client/mutation-outcome';

/**
 * Runs one administration mutation the way every workflow needs it: the
 * action's toast reports pending and success, and a failure comes back as a
 * field-level outcome the triggering form can render inline. Every `use…`
 * mutation hook is a thin binding over this single step, reached through the
 * per-scope runner that supplies `alert`.
 *
 * @param alert the scope's promise-toast adapter, already bound to its action
 * @param request the in-flight mutation
 * @param mapFieldErrors which field explains a refusal the server named none for
 */
export const runMutation = async (
  alert: (request: Promise<MutationResult>) => Promise<MutationResult>,
  request: Promise<MutationResult>,
  mapFieldErrors: FieldErrorMap = () => undefined,
): Promise<MutationOutcome> => {
  const result = await alert(request);
  if (!('error' in result)) {
    return { success: true };
  }
  if (!isApiFailure(result.error)) {
    return { success: false };
  }

  return {
    success: false,
    code: result.error.code,
    fieldErrors: result.error.fieldErrors ?? mapFieldErrors(result.error.code),
  };
};
