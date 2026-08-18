import {
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

import { api } from 'shared/api/client/api-client';
import { warehousePath } from 'shared/api/warehouse/warehouse-path';

import type { TagDescription } from '@reduxjs/toolkit/query';
import type {
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

/** Every Warehouse-scoped request names the Warehouse it acts in (AC-05). */
type InWarehouse<TRest = unknown> = { warehouseId: string } & TRest;
type RoleMutation = InWarehouse<{ roleId: string; input: RoleWrite }>;
type RoleDeletionMutation = InWarehouse<{
  roleId: string;
  input: RoleDeletion;
}>;
type RoleAssignmentMutation = InWarehouse<{
  userId: string;
  input: RoleAssignment;
}>;
type EmailChangeMutation = InWarehouse<{
  userId: string;
  input: EmailChangeInput;
}>;
type PasswordChangeMutation = InWarehouse<{
  userId: string;
  input: PasswordChangeInput;
}>;

const accessPath = (warehouseId: string, resource: string): string =>
  warehousePath(warehouseId, `access/${resource}`);

const usersPath = (warehouseId: string, resource = ''): string =>
  warehousePath(warehouseId, `users${resource ? `/${resource}` : ''}`);

/**
 * The cached views one Warehouse mutation can invalidate, each scoped to that
 * Warehouse so a change here never discards another Warehouse's data.
 *
 * The tags are returned whether the mutation committed or was refused, which is
 * what refreshes the actor's capability projection after a denial: authority
 * lost mid-session (`design-handoff.md` `OD62T`) must stop being offered, and
 * the denial itself is the only signal the web gets that it changed.
 */
const warehouseTags =
  (...types: ('AccessMembers' | 'CurrentAccess' | 'Roles')[]) =>
  (
    _result: unknown,
    _error: unknown,
    { warehouseId }: InWarehouse,
  ): TagDescription<'AccessMembers' | 'CurrentAccess' | 'Roles'>[] =>
    types.map((type) => ({ type, id: warehouseId }));

export const accessApi = api.injectEndpoints({
  endpoints: (build) => ({
    listAccessRoles: build.query<RolePage, string>({
      query: (warehouseId) => accessPath(warehouseId, 'roles'),
      extraOptions: { schema: rolePageSchema },
      providesTags: (_result, _error, warehouseId) => [
        { type: 'Roles', id: warehouseId },
      ],
    }),
    listAccessPermissions: build.query<PermissionPage, string>({
      query: (warehouseId) => accessPath(warehouseId, 'permissions'),
      extraOptions: { schema: permissionPageSchema },
      providesTags: (_result, _error, warehouseId) => [
        { type: 'Permissions', id: warehouseId },
      ],
    }),
    listAccessMembers: build.query<MemberPage, string>({
      query: (warehouseId) => accessPath(warehouseId, 'members'),
      extraOptions: { schema: memberPageSchema },
      providesTags: (_result, _error, warehouseId) => [
        { type: 'AccessMembers', id: warehouseId },
      ],
    }),
    createAccessRole: build.mutation<Role, InWarehouse<{ input: RoleWrite }>>({
      query: ({ warehouseId, input }) => ({
        url: accessPath(warehouseId, 'roles'),
        method: 'POST',
        body: input,
      }),
      extraOptions: { schema: roleMutationResultSchema },
      invalidatesTags: warehouseTags('Roles', 'CurrentAccess'),
    }),
    updateAccessRole: build.mutation<Role, RoleMutation>({
      query: ({ warehouseId, roleId, input }) => ({
        url: accessPath(warehouseId, `roles/${roleId}`),
        method: 'PATCH',
        body: input,
      }),
      extraOptions: { schema: roleMutationResultSchema },
      invalidatesTags: warehouseTags('Roles', 'AccessMembers', 'CurrentAccess'),
    }),
    deleteAccessRole: build.mutation<null, RoleDeletionMutation>({
      query: ({ warehouseId, roleId, input }) => ({
        url: accessPath(warehouseId, `roles/${roleId}`),
        method: 'DELETE',
        body: input,
      }),
      extraOptions: { emptyResponse: null },
      invalidatesTags: warehouseTags('Roles', 'AccessMembers', 'CurrentAccess'),
    }),
    assignAccessMemberRole: build.mutation<Member, RoleAssignmentMutation>({
      query: ({ warehouseId, userId, input }) => ({
        url: accessPath(warehouseId, `members/${userId}/role`),
        method: 'PUT',
        body: input,
      }),
      extraOptions: { schema: memberMutationResultSchema },
      // `Roles` too: a Role carries `assignedMemberCount`, so moving a Member
      // between Roles restates two of them. Without it the Roles list keeps
      // rendering the counts it read before the move.
      invalidatesTags: warehouseTags('AccessMembers', 'Roles', 'CurrentAccess'),
    }),
    // Archived-tolerant by ADR 0003: the Manager transfer's subject is a
    // membership edge, so it stays available on an archived Warehouse (AC-36).
    transferWarehouseManager: build.mutation<
      ManagerTransferResult,
      InWarehouse<{ input: ManagerTransfer }>
    >({
      query: ({ warehouseId, input }) => ({
        url: accessPath(warehouseId, 'manager-transfer'),
        method: 'POST',
        body: input,
      }),
      extraOptions: { schema: managerTransferResultSchema },
      invalidatesTags: warehouseTags('Roles', 'AccessMembers', 'CurrentAccess'),
    }),
    createMember: build.mutation<
      UserMember,
      InWarehouse<{ input: CreateMemberInput }>
    >({
      query: ({ warehouseId, input }) => ({
        url: usersPath(warehouseId),
        method: 'POST',
        body: input,
      }),
      extraOptions: { schema: memberSchema },
      // A new Member is created already holding a Role, which raises that
      // Role's `assignedMemberCount` (see `assignAccessMemberRole`).
      invalidatesTags: warehouseTags('AccessMembers', 'Roles', 'CurrentAccess'),
    }),
    changeMemberEmail: build.mutation<MemberEmail, EmailChangeMutation>({
      query: ({ warehouseId, userId, input }) => ({
        url: usersPath(warehouseId, `${userId}/email`),
        method: 'PATCH',
        body: input,
      }),
      extraOptions: { schema: memberEmailSchema },
      invalidatesTags: warehouseTags('AccessMembers', 'CurrentAccess'),
    }),
    changeMemberPassword: build.mutation<
      MemberConfirmation,
      PasswordChangeMutation
    >({
      query: ({ warehouseId, userId, input }) => ({
        url: usersPath(warehouseId, `${userId}/password`),
        method: 'PATCH',
        body: input,
      }),
      extraOptions: { schema: memberConfirmationSchema },
      invalidatesTags: warehouseTags('AccessMembers', 'CurrentAccess'),
    }),
    deleteMember: build.mutation<null, InWarehouse<{ userId: string }>>({
      query: ({ warehouseId, userId }) => ({
        url: usersPath(warehouseId, userId),
        method: 'DELETE',
      }),
      extraOptions: { emptyResponse: null },
      // Removing a Member lowers the `assignedMemberCount` of whichever Role
      // they held (see `assignAccessMemberRole`).
      invalidatesTags: warehouseTags('AccessMembers', 'Roles', 'CurrentAccess'),
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
  useListAccessMembersQuery,
  useListAccessPermissionsQuery,
  useListAccessRolesQuery,
  useTransferWarehouseManagerMutation,
  useUpdateAccessRoleMutation,
} = accessApi;
