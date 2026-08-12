import {
  assignableWarehouseRoleSchema,
  warehouseMembershipSchema,
  warehouseSchema,
} from '@warehouser/contracts/workspaces';
import { z } from 'zod';

import { workspaceUsersApi } from 'modules/workspace/api/workspace-users-api';
import { api } from 'shared/api/api-client';

import type {
  AssignableWarehouseRole,
  Warehouse,
  WarehouseArchival,
  WarehouseMembership,
  WarehouseMembershipAssignment,
  WarehouseWrite,
} from '@warehouser/contracts/workspaces';

const WAREHOUSES_PATH = '/api/v1/workspace/warehouses';

const warehouseListSchema = z.array(warehouseSchema);
const assignableWarehouseRoleListSchema = z.array(
  assignableWarehouseRoleSchema,
);

type WarehouseRename = WarehouseWrite & { warehouseId: string };
type WarehouseArchivalChange = WarehouseArchival & { warehouseId: string };
type WarehouseMembershipAssign = WarehouseMembershipAssignment & {
  warehouseId: string;
};
type WarehouseMembershipRevoke = { userId: string; warehouseId: string };

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
    // The narrow read `WAREHOUSE_MEMBERSHIPS:ASSIGN` carries: identifiers and
    // names of a Warehouse's assignable custom Roles only, the protected
    // Warehouse Manager Role already excluded server-side (AC-23a, AC-25).
    listAssignableWarehouseRoles: build.query<
      AssignableWarehouseRole[],
      string
    >({
      query: (warehouseId) =>
        `${WAREHOUSES_PATH}/${warehouseId}/assignable-roles`,
      extraOptions: { schema: assignableWarehouseRoleListSchema },
    }),
    assignWarehouseMembership: build.mutation<
      WarehouseMembership,
      WarehouseMembershipAssign
    >({
      query: ({ warehouseId, ...body }) => ({
        url: `${WAREHOUSES_PATH}/${warehouseId}/memberships`,
        method: 'POST',
        body,
      }),
      extraOptions: { schema: warehouseMembershipSchema },
      invalidatesTags: ['WorkspaceContext', 'WorkspaceUsers'],
    }),
    revokeWarehouseMembership: build.mutation<null, WarehouseMembershipRevoke>({
      query: ({ warehouseId, userId }) => ({
        url: `${WAREHOUSES_PATH}/${warehouseId}/memberships/${userId}`,
        method: 'DELETE',
      }),
      extraOptions: { emptyResponse: null },
      invalidatesTags: ['WorkspaceContext'],
      // The membership just withdrawn is already known precisely (AC-25b), so
      // patch the cached Workspace Users read directly instead of relying on
      // an invalidation-triggered refetch, which could race this optimistic
      // update and momentarily restore the withdrawn membership before the
      // next natural read reflects it.
      onQueryStarted: async (
        { userId, warehouseId },
        { dispatch, queryFulfilled },
      ) => {
        const patch = dispatch(
          workspaceUsersApi.util.updateQueryData(
            'listWorkspaceUsers',
            undefined,
            (draft) => {
              const user = draft.find(
                (candidate) => candidate.userId === userId,
              );
              if (user) {
                user.warehouses = user.warehouses.filter(
                  (membership) => membership.warehouseId !== warehouseId,
                );
              }
            },
          ),
        );
        const committed = await queryFulfilled.catch(() => undefined);
        if (!committed) {
          patch.undo();
        }
      },
    }),
  }),
  overrideExisting: false,
});

export const {
  useAssignWarehouseMembershipMutation,
  useCreateWarehouseMutation,
  useListAssignableWarehouseRolesQuery,
  useListWorkspaceWarehousesQuery,
  useRenameWarehouseMutation,
  useRevokeWarehouseMembershipMutation,
  useSetWarehouseArchivalMutation,
} = workspaceWarehousesApi;
