import { toast } from 'react-toastify';

import i18n from 'i18n';

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

export const alertAccessSuccess = (action: AccessSuccessAction): void => {
  toast.success(i18n.t(`access.${action}`, { ns: 'success' }), {
    toastId: `access:${action}`,
  });
};
