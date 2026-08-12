import { warehouseSchema } from '@warehouser/contracts/workspaces';
import { z } from 'zod';

import { api } from 'shared/api/api-client';

import type {
  Warehouse,
  WarehouseArchival,
  WarehouseWrite,
} from '@warehouser/contracts/workspaces';

const WAREHOUSES_PATH = '/api/v1/workspace/warehouses';

const warehouseListSchema = z.array(warehouseSchema);

type WarehouseRename = WarehouseWrite & { warehouseId: string };
type WarehouseArchivalChange = WarehouseArchival & { warehouseId: string };

/**
 * The Workspace's Warehouse record endpoints (sad.md §6.4, §6.4a, §6.5). Every
 * one of them is a Workspace capability even though a Warehouse identifier
 * appears in the path, because their subject is the Warehouse record itself.
 *
 * A mutation refreshes the Warehouse list and the actor context, because a new
 * or archived Warehouse changes what the switcher may offer. Creating one also
 * refreshes the Workspace users, since it establishes the creator's membership
 * in it.
 */
export const workspaceWarehousesApi = api.injectEndpoints({
  endpoints: (build) => ({
    listWorkspaceWarehouses: build.query<Warehouse[], void>({
      query: () => WAREHOUSES_PATH,
      extraOptions: { schema: warehouseListSchema },
      providesTags: ['WorkspaceWarehouses'],
    }),
    createWarehouse: build.mutation<Warehouse, WarehouseWrite>({
      query: (body) => ({ url: WAREHOUSES_PATH, method: 'POST', body }),
      extraOptions: { schema: warehouseSchema },
      invalidatesTags: [
        'WorkspaceContext',
        'WorkspaceUsers',
        'WorkspaceWarehouses',
      ],
    }),
    renameWarehouse: build.mutation<Warehouse, WarehouseRename>({
      query: ({ warehouseId, ...body }) => ({
        url: `${WAREHOUSES_PATH}/${warehouseId}`,
        method: 'PATCH',
        body,
      }),
      extraOptions: { schema: warehouseSchema },
      invalidatesTags: ['WorkspaceContext', 'WorkspaceWarehouses'],
    }),
    setWarehouseArchival: build.mutation<Warehouse, WarehouseArchivalChange>({
      query: ({ warehouseId, ...body }) => ({
        url: `${WAREHOUSES_PATH}/${warehouseId}/archival`,
        method: 'PUT',
        body,
      }),
      extraOptions: { schema: warehouseSchema },
      invalidatesTags: ['WorkspaceContext', 'WorkspaceWarehouses'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useCreateWarehouseMutation,
  useListWorkspaceWarehousesQuery,
  useRenameWarehouseMutation,
  useSetWarehouseArchivalMutation,
} = workspaceWarehousesApi;
