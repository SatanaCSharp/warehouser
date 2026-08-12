import i18n from 'i18n';
import { alertActionPromise } from 'shared/alerts/action-feedback';

export type WorkspaceSuccessAction = 'renameWorkspace';

type MutationOutcome = { data: unknown } | { error: unknown };

/**
 * Reports a Workspace administration mutation through a promise toast: the
 * action-specific pending description while the request runs, then the
 * matching success description once the workflow completed.
 */
export const alertWorkspaceAction = async <TResult extends MutationOutcome>(
  action: WorkspaceSuccessAction,
  request: Promise<TResult>,
): Promise<TResult> =>
  alertActionPromise(request, {
    loading: i18n.t(`workspace.${action}`, { ns: 'pending' }),
    success: i18n.t(`workspace.${action}`, { ns: 'success' }),
  });
