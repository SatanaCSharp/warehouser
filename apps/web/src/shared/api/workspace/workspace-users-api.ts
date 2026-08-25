import { workspaceUserSchema } from '@warehouser/contracts/workspaces';
import { z } from 'zod';

import { api } from 'shared/api/client/api-client';

import type { WorkspaceUser } from '@warehouser/contracts/workspaces';

const WORKSPACE_USERS_PATH = '/api/v1/workspace/users';

/**
 * The Users of the Workspace with the Warehouses each belongs to — the read
 * `WORKSPACE_MEMBERS:WATCH` carries so the candidates Workspace membership and
 * Warehouse-membership assignment act on can be found (AC-33).
 *
 * It is its own dataset with its own watch Permission, so it lives beside the
 * Warehouse endpoints rather than inside them: the Warehouses tab reads it for
 * the people who have access, and the Members tab reads the same cache entry.
 */
export const workspaceUsersApi = api.injectEndpoints({
  endpoints: (build) => ({
    listWorkspaceUsers: build.query<WorkspaceUser[], void>({
      query: () => WORKSPACE_USERS_PATH,
      extraOptions: { schema: z.array(workspaceUserSchema) },
      providesTags: ['WorkspaceUsers'],
    }),
  }),
  overrideExisting: false,
});

export const { useListWorkspaceUsersQuery } = workspaceUsersApi;
