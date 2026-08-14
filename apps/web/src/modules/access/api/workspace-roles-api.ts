import {
  workspacePermissionSchema,
  workspaceRoleSchema,
} from '@warehouser/contracts/workspaces';
import { z } from 'zod';

import { api } from 'shared/api/api-client';

import type {
  WorkspacePermission,
  WorkspaceRole,
  WorkspaceRoleDeletion,
  WorkspaceRoleWrite,
} from '@warehouser/contracts/workspaces';

const WORKSPACE_ROLES_PATH = '/api/v1/workspace/roles';
const WORKSPACE_PERMISSIONS_PATH = '/api/v1/workspace/permissions';

const workspaceRoleListSchema = z.array(workspaceRoleSchema);
const workspacePermissionListSchema = z.array(workspacePermissionSchema);

type WorkspaceRoleUpdate = WorkspaceRoleWrite & { workspaceRoleId: string };
type WorkspaceRoleDelete = WorkspaceRoleDeletion & { workspaceRoleId: string };

/**
 * The Workspace Role lifecycle and the system Permission catalogue (sad.md
 * §6.6, §6.7). Both reads are gated by `WORKSPACE_ROLES:WATCH` (AC-32) and are
 * requested only when the actor holds it.
 *
 * A Role mutation refreshes three things: the Role list itself, the Workspace
 * Members (a delete-with-replacement moves people between Roles, AC-17) and
 * the actor context (the acting member may hold the Role they just changed, so
 * their own capabilities can have narrowed). The catalogue is system-managed
 * (AC-18), so nothing invalidates it.
 */
export const workspaceRolesApi = api.injectEndpoints({
  endpoints: (build) => ({
    listWorkspaceRoles: build.query<WorkspaceRole[], void>({
      query: () => WORKSPACE_ROLES_PATH,
      extraOptions: { schema: workspaceRoleListSchema },
      providesTags: ['WorkspaceRoles'],
    }),
    listWorkspacePermissions: build.query<WorkspacePermission[], void>({
      query: () => WORKSPACE_PERMISSIONS_PATH,
      extraOptions: { schema: workspacePermissionListSchema },
      providesTags: ['WorkspacePermissions'],
    }),
    createWorkspaceRole: build.mutation<WorkspaceRole, WorkspaceRoleWrite>({
      query: (body) => ({ url: WORKSPACE_ROLES_PATH, method: 'POST', body }),
      extraOptions: { schema: workspaceRoleSchema },
      invalidatesTags: ['WorkspaceRoles'],
    }),
    updateWorkspaceRole: build.mutation<WorkspaceRole, WorkspaceRoleUpdate>({
      query: ({ workspaceRoleId, ...body }) => ({
        url: `${WORKSPACE_ROLES_PATH}/${workspaceRoleId}`,
        method: 'PATCH',
        body,
      }),
      extraOptions: { schema: workspaceRoleSchema },
      invalidatesTags: ['WorkspaceContext', 'WorkspaceRoles'],
    }),
    deleteWorkspaceRole: build.mutation<null, WorkspaceRoleDelete>({
      query: ({ workspaceRoleId, ...body }) => ({
        url: `${WORKSPACE_ROLES_PATH}/${workspaceRoleId}`,
        method: 'DELETE',
        body,
      }),
      extraOptions: { emptyResponse: null },
      invalidatesTags: [
        'WorkspaceContext',
        'WorkspaceMembers',
        'WorkspaceRoles',
      ],
    }),
  }),
  overrideExisting: false,
});

export const {
  useCreateWorkspaceRoleMutation,
  useDeleteWorkspaceRoleMutation,
  useListWorkspacePermissionsQuery,
  useListWorkspaceRolesQuery,
  useUpdateWorkspaceRoleMutation,
} = workspaceRolesApi;
