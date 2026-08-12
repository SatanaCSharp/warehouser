import {
  activeWarehouseSelectionSchema,
  workspaceContextSchema,
  workspaceSchema,
} from '@warehouser/contracts/workspaces';

import { api } from 'shared/api/api-client';

import type {
  ActiveWarehouseSelection,
  ActiveWarehouseWrite,
  Workspace,
  WorkspaceContext,
  WorkspaceRename,
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
      // AC-04 — a denied write leaves the current selection unchanged. A
      // static tag list invalidates on both success and failure, which would
      // refetch the context after a denial and could momentarily show a
      // stale or empty state; only a committed write should trigger it.
      invalidatesTags: (_result, error) => (error ? [] : ['WorkspaceContext']),
    }),
    renameWorkspace: build.mutation<Workspace, WorkspaceRename>({
      query: (body) => ({
        url: WORKSPACE_PATH,
        method: 'PATCH',
        body,
      }),
      extraOptions: { schema: workspaceSchema },
      // AC-29 — the renamed Workspace is what the response actually
      // committed; patch the cached context directly instead of
      // invalidating and refetching, which would race a concurrent context
      // read and could momentarily show the prior name or placeholder.
      // A rejected rename changes nothing, and the normalized failure is
      // already reported by the shared error boundary, so this only patches a
      // committed result.
      onQueryStarted: async (_input, { dispatch, queryFulfilled }) => {
        const committed = await queryFulfilled.catch(() => undefined);
        if (!committed) {
          return;
        }
        dispatch(
          workspaceContextApi.util.updateQueryData(
            'getWorkspaceContext',
            undefined,
            (draft) => {
              Object.assign(draft.workspace, committed.data);
            },
          ),
        );
      },
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetWorkspaceContextQuery,
  useRenameWorkspaceMutation,
  useSetActiveWarehouseMutation,
} = workspaceContextApi;
