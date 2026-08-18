import { alertWorkspaceAction } from 'shared/alerts/workspace-feedback';
import { runMutation } from 'shared/api/client/run-mutation';

import type { WorkspaceSuccessAction } from 'shared/alerts/workspace-feedback';
import type {
  FieldErrorMap,
  MutationOutcome,
  MutationResult,
} from 'shared/api/client/mutation-outcome';

/**
 * Runs one Workspace administration mutation behind its own action toast.
 * Every `use…` mutation hook in the Workspace modules is a thin binding over
 * this, which is itself the shared `runMutation` step bound to the Workspace
 * feedback adapter.
 *
 * @param params interpolates the outcome's subject into the toast description.
 */
export const runWorkspaceMutation = async (
  action: WorkspaceSuccessAction,
  request: Promise<MutationResult>,
  mapFieldErrors?: FieldErrorMap,
  params?: Record<string, unknown>,
): Promise<MutationOutcome> =>
  runMutation(
    (pending) => alertWorkspaceAction(action, pending, params),
    request,
    mapFieldErrors,
  );
