import { alertAccessAction } from 'modules/access/alerts/access-feedback';
import { isApiFailure } from 'shared/api/client/api-client';

import type { AccessSuccessAction } from 'modules/access/alerts/access-feedback';
import type { MutationOutcome } from 'shared/api/client/mutation-outcome';

type MutationResult = { data: unknown } | { error: unknown };

/** Maps a server error code to the form fields that code invalidates. */
export type FieldErrorMap = (
  code: string,
) => Record<string, string> | undefined;

/**
 * Runs one access mutation the way every access workflow needs it: the action's
 * toast reports pending and success, and a failure comes back as a field-level
 * outcome the triggering form can render inline. Every `use…` mutation hook in
 * this module is a thin binding over this single step.
 */
export const runAccessMutation = async (
  action: AccessSuccessAction,
  request: Promise<MutationResult>,
  mapFieldErrors: FieldErrorMap = () => undefined,
): Promise<MutationOutcome> => {
  const result = await alertAccessAction(action, request);
  if (!('error' in result)) {
    return { success: true };
  }
  if (!isApiFailure(result.error)) {
    return { success: false };
  }
  return {
    success: false,
    fieldErrors: result.error.fieldErrors ?? mapFieldErrors(result.error.code),
  };
};
