import { alertWorkspaceAction } from 'modules/workspace/alerts/workspace-feedback';
import { isApiFailure } from 'shared/api/api-client';

import type { WorkspaceSuccessAction } from 'modules/workspace/alerts/workspace-feedback';
import type { MutationOutcome } from 'modules/workspace/types/workspace.types';

type MutationResult = { data: unknown } | { error: unknown };

/** Maps a server error code to the form fields that code invalidates. */
export type FieldErrorMap = (
  code: string,
) => Record<string, string> | undefined;

/**
 * Runs one Workspace administration mutation the way every Workspace workflow
 * needs it: the action's toast reports pending and success, and a failure
 * comes back as a field-level outcome the triggering form can render inline.
 * Every `use…` mutation hook in this module is a thin binding over this
 * single step.
 */
export const runWorkspaceMutation = async (
  action: WorkspaceSuccessAction,
  request: Promise<MutationResult>,
  mapFieldErrors: FieldErrorMap = () => undefined,
): Promise<MutationOutcome> => {
  const result = await alertWorkspaceAction(action, request);
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
