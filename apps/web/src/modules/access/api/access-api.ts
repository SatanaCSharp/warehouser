import {
  accessProjectionSchema,
  managerTransferResultSchema,
  memberMutationResultSchema,
  memberPageSchema,
  permissionPageSchema,
  roleMutationResultSchema,
  rolePageSchema,
} from '@warehouser/contracts/access';
import {
  memberConfirmationSchema,
  memberEmailSchema,
  memberSchema,
} from '@warehouser/contracts/users';

import { api } from 'shared/api/api-client';

import type {
  AccessProjection,
  ManagerTransfer,
  ManagerTransferResult,
  MemberPage,
  PermissionPage,
  RoleAssignment,
  RoleDeletion,
  RolePage,
  RoleWrite,
} from '@warehouser/contracts/access';
import type {
  CreateMemberInput,
  EmailChangeInput,
  Member as UserMember,
  MemberConfirmation,
  MemberEmail,
  PasswordChangeInput,
} from '@warehouser/contracts/users';

type Role = RolePage['items'][number];
type Member = MemberPage['items'][number];
type RoleMutation = { roleId: string; input: RoleWrite };
type RoleDeletionMutation = { roleId: string; input: RoleDeletion };
type RoleAssignmentMutation = { userId: string; input: RoleAssignment };
type EmailChangeMutation = { userId: string; input: EmailChangeInput };
type PasswordChangeMutation = { userId: string; input: PasswordChangeInput };

const ACCESS_PATH = '/api/v1/access';
const USERS_PATH = '/api/v1/users';

export const accessApi = api.injectEndpoints({
  endpoints: (build) => ({
    getCurrentAccess: build.query<AccessProjection, void>({
      query: () => `${ACCESS_PATH}/current`,
      extraOptions: { schema: accessProjectionSchema },
      providesTags: ['CurrentAccess'],
    }),
    listAccessRoles: build.query<RolePage, void>({
      query: () => `${ACCESS_PATH}/roles`,
      extraOptions: { schema: rolePageSchema },
      providesTags: ['Roles'],
    }),
    listAccessPermissions: build.query<PermissionPage, void>({
      query: () => `${ACCESS_PATH}/permissions`,
      extraOptions: { schema: permissionPageSchema },
      providesTags: ['Permissions'],
    }),
    listAccessMembers: build.query<MemberPage, void>({
      query: () => `${ACCESS_PATH}/members`,
      extraOptions: { schema: memberPageSchema },
      providesTags: ['AccessMembers'],
    }),
    createAccessRole: build.mutation<Role, RoleWrite>({
      query: (body) => ({ url: `${ACCESS_PATH}/roles`, method: 'POST', body }),
      extraOptions: { schema: roleMutationResultSchema },
      invalidatesTags: ['Roles', 'CurrentAccess'],
    }),
    updateAccessRole: build.mutation<Role, RoleMutation>({
      query: ({ roleId, input }) => ({
        url: `${ACCESS_PATH}/roles/${roleId}`,
        method: 'PATCH',
        body: input,
      }),
      extraOptions: { schema: roleMutationResultSchema },
      invalidatesTags: ['Roles', 'AccessMembers', 'CurrentAccess'],
    }),
    deleteAccessRole: build.mutation<null, RoleDeletionMutation>({
      query: ({ roleId, input }) => ({
        url: `${ACCESS_PATH}/roles/${roleId}`,
        method: 'DELETE',
        body: input,
      }),
      extraOptions: { emptyResponse: null },
      invalidatesTags: ['Roles', 'AccessMembers', 'CurrentAccess'],
    }),
    assignAccessMemberRole: build.mutation<Member, RoleAssignmentMutation>({
      query: ({ userId, input }) => ({
        url: `${ACCESS_PATH}/members/${userId}/role`,
        method: 'PUT',
        body: input,
      }),
      extraOptions: { schema: memberMutationResultSchema },
      invalidatesTags: ['AccessMembers', 'CurrentAccess'],
    }),
    transferWarehouseManager: build.mutation<
      ManagerTransferResult,
      ManagerTransfer
    >({
      query: (body) => ({
        url: `${ACCESS_PATH}/manager-transfer`,
        method: 'POST',
        body,
      }),
      extraOptions: { schema: managerTransferResultSchema },
      invalidatesTags: ['Roles', 'AccessMembers', 'CurrentAccess'],
    }),
    createMember: build.mutation<UserMember, CreateMemberInput>({
      query: (body) => ({ url: USERS_PATH, method: 'POST', body }),
      extraOptions: { schema: memberSchema },
      invalidatesTags: ['AccessMembers', 'CurrentAccess'],
    }),
    changeMemberEmail: build.mutation<MemberEmail, EmailChangeMutation>({
      query: ({ userId, input }) => ({
        url: `${USERS_PATH}/${userId}/email`,
        method: 'PATCH',
        body: input,
      }),
      extraOptions: { schema: memberEmailSchema },
      invalidatesTags: ['AccessMembers', 'CurrentAccess'],
    }),
    changeMemberPassword: build.mutation<
      MemberConfirmation,
      PasswordChangeMutation
    >({
      query: ({ userId, input }) => ({
        url: `${USERS_PATH}/${userId}/password`,
        method: 'PATCH',
        body: input,
      }),
      extraOptions: { schema: memberConfirmationSchema },
      invalidatesTags: ['AccessMembers', 'CurrentAccess'],
    }),
    deleteMember: build.mutation<null, string>({
      query: (userId) => ({
        url: `${USERS_PATH}/${userId}`,
        method: 'DELETE',
      }),
      extraOptions: { emptyResponse: null },
      invalidatesTags: ['AccessMembers', 'CurrentAccess'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useAssignAccessMemberRoleMutation,
  useChangeMemberEmailMutation,
  useChangeMemberPasswordMutation,
  useCreateAccessRoleMutation,
  useCreateMemberMutation,
  useDeleteAccessRoleMutation,
  useDeleteMemberMutation,
  useGetCurrentAccessQuery,
  useListAccessMembersQuery,
  useListAccessPermissionsQuery,
  useListAccessRolesQuery,
  useTransferWarehouseManagerMutation,
  useUpdateAccessRoleMutation,
} = accessApi;
