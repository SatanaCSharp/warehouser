import { alertScopedAction } from 'shared/alerts/action-feedback';

import type { MutationResult } from 'shared/api/client/mutation-outcome';

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

/**
 * Reports a Workspace administration mutation through a promise toast. `params`
 * interpolates the outcome's subject — such as the Warehouse name — into that
 * description, so the success toast names what committed rather than only
 * naming the action.
 */
export const alertWorkspaceAction = async <TResult extends MutationResult>(
  action: WorkspaceSuccessAction,
  request: Promise<TResult>,
  params?: Record<string, unknown>,
): Promise<TResult> => alertScopedAction('workspace', action, request, params);
