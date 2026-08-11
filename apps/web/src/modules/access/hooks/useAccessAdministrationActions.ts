import { ErrorCode } from '@warehouser/shared-types/enums';

import { alertAccessAction } from 'modules/access/alerts/access-feedback';
import {
  useAssignAccessMemberRoleMutation,
  useChangeMemberEmailMutation,
  useChangeMemberPasswordMutation,
  useCreateAccessRoleMutation,
  useCreateMemberMutation,
  useDeleteAccessRoleMutation,
  useDeleteMemberMutation,
  useTransferWarehouseManagerMutation,
  useUpdateAccessRoleMutation,
} from 'modules/access/api/access-api';
import { isApiFailure } from 'shared/api/api-client';

import type { AccessAdministrationActions as AdministrationActions } from 'modules/access/types/access-administration.types';

const createMemberFieldErrors = (
  code: string,
): Record<string, string> | undefined => {
  if (code === ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED) {
    return { email: 'duplicate' };
  }
  if (
    code === ErrorCode.USERS_PERMISSION_EXCEEDED ||
    code === ErrorCode.USERS_RESERVED_ROLE_SELECTION
  ) {
    return { roleId: 'exceeded' };
  }
  return undefined;
};

const changeMemberEmailFieldErrors = (
  code: string,
): Record<string, string> | undefined => {
  if (code === ErrorCode.USERS_MANAGER_ROLE_PROTECTED) {
    return { email: 'protected' };
  }
  if (code === ErrorCode.USERS_PERMISSION_EXCEEDED) {
    return { email: 'exceeded' };
  }
  if (code === ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED) {
    return { email: 'duplicate' };
  }
  return undefined;
};

const changeMemberPasswordFieldErrors = (
  code: string,
): Record<string, string> | undefined => {
  if (code === ErrorCode.USERS_MANAGER_ROLE_PROTECTED) {
    return { password: 'protected' };
  }
  if (code === ErrorCode.USERS_PERMISSION_EXCEEDED) {
    return { password: 'exceeded' };
  }
  return undefined;
};

export const useAccessAdministrationActions = (): AdministrationActions => {
  const [createRole] = useCreateAccessRoleMutation();
  const [updateRole] = useUpdateAccessRoleMutation();
  const [assignRole] = useAssignAccessMemberRoleMutation();
  const [deleteRole] = useDeleteAccessRoleMutation();
  const [transferManager] = useTransferWarehouseManagerMutation();
  const [createMember] = useCreateMemberMutation();
  const [changeMemberEmail] = useChangeMemberEmailMutation();
  const [changeMemberPassword] = useChangeMemberPasswordMutation();
  const [deleteMember] = useDeleteMemberMutation();

  return {
    onAssignRole: async (userId, roleId) => {
      const result = await alertAccessAction(
        'assignRole',
        assignRole({ userId, input: { roleId } }),
      );
      if ('error' in result) {
        return { success: false };
      }
      return { success: true };
    },
    onDeleteRole: async (roleId, replacementRoleId) => {
      const result = await alertAccessAction(
        'deleteRole',
        deleteRole({ roleId, input: { replacementRoleId } }),
      );
      if ('error' in result) {
        return { success: false };
      }
      return { success: true };
    },
    onSaveRole: async (input, roleId) => {
      const result = await alertAccessAction(
        roleId ? 'updateRole' : 'createRole',
        roleId ? updateRole({ roleId, input }) : createRole(input),
      );
      if ('error' in result) {
        return {
          success: false,
          fieldErrors: isApiFailure(result.error)
            ? result.error.fieldErrors
            : undefined,
        };
      }
      return { success: true };
    },
    onTransferManager: async (recipientUserId, formerManagerRoleId) => {
      const result = await alertAccessAction(
        'transferManager',
        transferManager({ recipientUserId, formerManagerRoleId }),
      );
      if ('error' in result) {
        return { success: false };
      }
      return { success: true };
    },
    onCreateMember: async (input) => {
      const result = await alertAccessAction(
        'createMember',
        createMember(input),
      );
      if ('error' in result) {
        if (!isApiFailure(result.error)) {
          return { success: false };
        }
        return {
          success: false,
          fieldErrors:
            result.error.fieldErrors ??
            createMemberFieldErrors(result.error.code),
        };
      }
      return { success: true };
    },
    onChangeMemberEmail: async (userId, input) => {
      const result = await alertAccessAction(
        'changeMemberEmail',
        changeMemberEmail({ userId, input }),
      );
      if ('error' in result) {
        if (!isApiFailure(result.error)) {
          return { success: false };
        }
        return {
          success: false,
          fieldErrors:
            result.error.fieldErrors ??
            changeMemberEmailFieldErrors(result.error.code),
        };
      }
      return { success: true };
    },
    onChangeMemberPassword: async (userId, input) => {
      const result = await alertAccessAction(
        'changeMemberPassword',
        changeMemberPassword({ userId, input }),
      );
      if ('error' in result) {
        if (!isApiFailure(result.error)) {
          return { success: false };
        }
        return {
          success: false,
          fieldErrors:
            result.error.fieldErrors ??
            changeMemberPasswordFieldErrors(result.error.code),
        };
      }
      return { success: true };
    },
    onDeleteMember: async (userId) => {
      const result = await alertAccessAction(
        'deleteMember',
        deleteMember(userId),
      );
      if ('error' in result) {
        return {
          success: false,
          fieldErrors: isApiFailure(result.error)
            ? result.error.fieldErrors
            : undefined,
        };
      }
      return { success: true };
    },
  };
};
