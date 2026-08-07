import { ErrorCode } from '@warehouser/shared-types/enums';

import { alertAccessSuccess } from 'modules/access/alerts/access-feedback';
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

import type {
  CreateMemberInput,
  EmailChangeInput,
  PasswordChangeInput,
} from '@warehouser/contracts/users';
import type { AccessAdministrationProps } from 'modules/access/components/access-administration/AccessAdministration';
import type { MutationOutcome } from 'modules/access/types/access-administration.types';

type AdministrationActions = Pick<
  AccessAdministrationProps,
  'onAssignRole' | 'onDeleteRole' | 'onSaveRole' | 'onTransferManager'
> & {
  onCreateMember: (input: CreateMemberInput) => Promise<MutationOutcome>;
  onChangeMemberEmail: (
    userId: string,
    input: EmailChangeInput,
  ) => Promise<MutationOutcome>;
  onChangeMemberPassword: (
    userId: string,
    input: PasswordChangeInput,
  ) => Promise<MutationOutcome>;
  onDeleteMember: (userId: string) => Promise<MutationOutcome>;
};

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
    onCreateMember: async (input) => {
      const result = await createMember(input);
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
      alertAccessSuccess('createMember');
      return { success: true };
    },
    onChangeMemberEmail: async (userId, input) => {
      const result = await changeMemberEmail({ userId, input });
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
      alertAccessSuccess('changeMemberEmail');
      return { success: true };
    },
    onChangeMemberPassword: async (userId, input) => {
      const result = await changeMemberPassword({ userId, input });
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
      alertAccessSuccess('changeMemberPassword');
      return { success: true };
    },
    onDeleteMember: async (userId) => {
      const result = await deleteMember(userId);
      if ('error' in result) {
        return {
          success: false,
          fieldErrors: isApiFailure(result.error)
            ? result.error.fieldErrors
            : undefined,
        };
      }
      alertAccessSuccess('deleteMember');
      return { success: true };
    },
  };
};
