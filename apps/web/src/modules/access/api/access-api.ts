import {
  accessProjectionSchema,
  memberPageSchema,
  permissionPageSchema,
  rolePageSchema,
} from '@warehouser/contracts/access';

import { api } from 'shared/api/api-client';

import type {
  AccessProjection,
  MemberPage,
  PermissionPage,
  RolePage,
} from '@warehouser/contracts/access';

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
  }),
  overrideExisting: false,
});

export const {
  useGetCurrentAccessQuery,
  useListAccessMembersQuery,
  useListAccessPermissionsQuery,
  useListAccessRolesQuery,
} = accessApi;
