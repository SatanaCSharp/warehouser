import {
  accessProjectionSchema,
  managerTransferResultSchema,
  memberMutationResultSchema,
  memberPageSchema,
  permissionPageSchema,
  roleMutationResultSchema,
  rolePageSchema,
} from '@warehouser/contracts/access';

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

type Role = RolePage['items'][number];
type Member = MemberPage['items'][number];
type RoleMutation = { roleId: string; input: RoleWrite };
type RoleDeletionMutation = { roleId: string; input: RoleDeletion };
type RoleAssignmentMutation = { userId: string; input: RoleAssignment };

const ACCESS_PATH = '/api/v1/access';

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
  }),
  overrideExisting: false,
});

export const {
  useAssignAccessMemberRoleMutation,
  useCreateAccessRoleMutation,
  useDeleteAccessRoleMutation,
  useGetCurrentAccessQuery,
  useListAccessMembersQuery,
  useListAccessPermissionsQuery,
  useListAccessRolesQuery,
  useTransferWarehouseManagerMutation,
  useUpdateAccessRoleMutation,
} = accessApi;
