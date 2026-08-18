import { alertScopedAction } from 'shared/alerts/action-feedback';

import type { MutationResult } from 'shared/api/client/mutation-outcome';

export type AccessSuccessAction =
  | 'assignRole'
  | 'changeMemberEmail'
  | 'changeMemberPassword'
  | 'createMember'
  | 'createRole'
  | 'deleteMember'
  | 'deleteRole'
  | 'transferManager'
  | 'updateRole';

/** Reports an access administration mutation through a promise toast. */
export const alertAccessAction = async <TResult extends MutationResult>(
  action: AccessSuccessAction,
  request: Promise<TResult>,
): Promise<TResult> => alertScopedAction('access', action, request);
