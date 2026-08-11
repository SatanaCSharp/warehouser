import i18n from 'i18n';
import { alertActionPromise } from 'shared/alerts/action-feedback';

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

type MutationOutcome = { data: unknown } | { error: unknown };

/**
 * Reports an access administration mutation through a promise toast: the
 * action-specific pending description while the request runs, then the matching
 * success description once the workflow completed.
 */
export const alertAccessAction = async <TResult extends MutationOutcome>(
  action: AccessSuccessAction,
  request: Promise<TResult>,
): Promise<TResult> =>
  alertActionPromise(request, {
    loading: i18n.t(`access.${action}`, { ns: 'pending' }),
    success: i18n.t(`access.${action}`, { ns: 'success' }),
  });
