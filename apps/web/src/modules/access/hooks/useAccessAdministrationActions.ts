import { alertAccessSuccess } from 'modules/access/alerts/access-feedback';
import {
  useAssignAccessMemberRoleMutation,
  useCreateAccessRoleMutation,
  useDeleteAccessRoleMutation,
  useTransferWarehouseManagerMutation,
  useUpdateAccessRoleMutation,
} from 'modules/access/api/access-api';
import { isApiFailure } from 'shared/api/api-client';

import type { AccessAdministrationProps } from 'modules/access/components/access-administration/AccessAdministration';

type AdministrationActions = Pick<
  AccessAdministrationProps,
  'onAssignRole' | 'onDeleteRole' | 'onSaveRole' | 'onTransferManager'
>;

export const useAccessAdministrationActions = (): AdministrationActions => {
  const [createRole] = useCreateAccessRoleMutation();
  const [updateRole] = useUpdateAccessRoleMutation();
  const [assignRole] = useAssignAccessMemberRoleMutation();
  const [deleteRole] = useDeleteAccessRoleMutation();
  const [transferManager] = useTransferWarehouseManagerMutation();

  return {
    onAssignRole: async (userId, roleId) => {
      const result = await assignRole({ userId, input: { roleId } });
      if ('error' in result) {
        return { success: false };
      }
      alertAccessSuccess('assignRole');
      return { success: true };
    },
    onDeleteRole: async (roleId, replacementRoleId) => {
      const result = await deleteRole({
        roleId,
        input: { replacementRoleId },
      });
      if ('error' in result) {
        return { success: false };
      }
      alertAccessSuccess('deleteRole');
      return { success: true };
    },
    onSaveRole: async (input, roleId) => {
      const result = roleId
        ? await updateRole({ roleId, input })
        : await createRole(input);
      if ('error' in result) {
        return {
          success: false,
          fieldErrors: isApiFailure(result.error)
            ? result.error.fieldErrors
            : undefined,
        };
      }
      alertAccessSuccess(roleId ? 'updateRole' : 'createRole');
      return { success: true };
    },
    onTransferManager: async (recipientUserId, formerManagerRoleId) => {
      const result = await transferManager({
        recipientUserId,
        formerManagerRoleId,
      });
      if ('error' in result) {
        return { success: false };
      }
      alertAccessSuccess('transferManager');
      return { success: true };
    },
  };
};
