import {
  activeWarehouseSelectionSchema,
  workspaceContextSchema,
} from '@warehouser/contracts/workspaces';

import { api } from 'shared/api/api-client';

import type {
  ActiveWarehouseSelection,
  ActiveWarehouseWrite,
  WorkspaceContext,
} from '@warehouser/contracts/workspaces';

const WORKSPACE_PATH = '/api/v1/workspace';

export const workspaceContextApi = api.injectEndpoints({
  endpoints: (build) => ({
    getWorkspaceContext: build.query<WorkspaceContext, void>({
      query: () => `${WORKSPACE_PATH}/context`,
      extraOptions: { schema: workspaceContextSchema },
      providesTags: ['WorkspaceContext'],
    }),
    setActiveWarehouse: build.mutation<
      ActiveWarehouseSelection,
      ActiveWarehouseWrite
    >({
      query: (body) => ({
        url: `${WORKSPACE_PATH}/active-warehouse`,
        method: 'PUT',
        body,
      }),
      extraOptions: { schema: activeWarehouseSelectionSchema },
      invalidatesTags: ['WorkspaceContext'],
    }),
  }),
  overrideExisting: false,
});

export const { useGetWorkspaceContextQuery, useSetActiveWarehouseMutation } =
  workspaceContextApi;
