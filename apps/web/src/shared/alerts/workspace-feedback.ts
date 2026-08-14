import i18n from 'i18n';
import { alertActionPromise } from 'shared/alerts/action-feedback';

export type WorkspaceSuccessAction =
  | 'addWorkspaceMember'
  | 'archiveWarehouse'
  | 'assignWorkspaceRole'
  | 'createWarehouse'
  | 'createWorkspaceRole'
  | 'deleteWorkspaceRole'
  | 'giveWarehouseAccess'
  | 'renameWarehouse'
  | 'removeWorkspaceMember'
  | 'renameWorkspace'
  | 'restoreWarehouse'
  | 'transferWorkspaceOwner'
  | 'updateWorkspaceRole'
  | 'withdrawWarehouseAccess';

type MutationOutcome = { data: unknown } | { error: unknown };

/**
 * Reports a Workspace administration mutation through a promise toast: the
 * action-specific pending description while the request runs, then the
 * matching success description once the workflow completed. `params`
 * interpolates the outcome's subject — such as the Warehouse name — into
 * that description, so the success toast names what committed rather than
 * only naming the action.
 */
export const alertWorkspaceAction = async <TResult extends MutationOutcome>(
  action: WorkspaceSuccessAction,
  request: Promise<TResult>,
  params?: Record<string, unknown>,
): Promise<TResult> =>
  alertActionPromise(request, {
    loading: i18n.t(`workspace.${action}`, { ns: 'pending', ...params }),
    success: i18n.t(`workspace.${action}`, { ns: 'success', ...params }),
  });
