import {
  itemSchema,
  onHandAdjustmentSchema,
} from '@warehouser/contracts/items';
import { z } from 'zod';

import { api } from 'shared/api/client/api-client';

import type {
  Item,
  ItemCreate,
  ItemUpdate,
  OnHandAdjustment,
  OnHandAdjustmentCreate,
} from '@warehouser/contracts/items';

const itemsPath = (warehouseId: string): string =>
  `/api/v1/warehouses/${warehouseId}/items`;

const itemPath = (warehouseId: string, itemId: string): string =>
  `${itemsPath(warehouseId)}/${itemId}`;

const itemListSchema = z.array(itemSchema);

type ItemCreateArgs = { warehouseId: string; input: ItemCreate };
type ItemUpdateArgs = {
  warehouseId: string;
  itemId: string;
  input: ItemUpdate;
};
type ItemIdArgs = { warehouseId: string; itemId: string };
type OnHandAdjustmentArgs = {
  input: OnHandAdjustmentCreate;
  itemId: string;
  warehouseId: string;
};

/**
 * The Warehouse's Item catalogue endpoints (sad.md §5 `items/usecases`, T18).
 * Every write invalidates the one `Items` list tag: the catalogue is read
 * whole (§spec.md scale), so a targeted cache patch buys nothing a refetch of
 * one small list does not already give for free.
 */
export const itemApi = api.injectEndpoints({
  endpoints: (build) => ({
    listItems: build.query<Item[], string>({
      query: (warehouseId) => itemsPath(warehouseId),
      extraOptions: { schema: itemListSchema },
      providesTags: ['Items'],
    }),
    createItem: build.mutation<Item, ItemCreateArgs>({
      query: ({ warehouseId, input }) => ({
        url: itemsPath(warehouseId),
        method: 'POST',
        body: input,
      }),
      extraOptions: { schema: itemSchema },
      invalidatesTags: ['Items'],
    }),
    updateItem: build.mutation<Item, ItemUpdateArgs>({
      query: ({ warehouseId, itemId, input }) => ({
        url: itemPath(warehouseId, itemId),
        method: 'PATCH',
        body: input,
      }),
      extraOptions: { schema: itemSchema },
      invalidatesTags: ['Items'],
    }),
    deactivateItem: build.mutation<Item, ItemIdArgs>({
      query: ({ warehouseId, itemId }) => ({
        url: `${itemPath(warehouseId, itemId)}/deactivation`,
        method: 'POST',
      }),
      extraOptions: { schema: itemSchema },
      invalidatesTags: ['Items'],
    }),
    reactivateItem: build.mutation<Item, ItemIdArgs>({
      query: ({ warehouseId, itemId }) => ({
        url: `${itemPath(warehouseId, itemId)}/deactivation`,
        method: 'DELETE',
      }),
      extraOptions: { schema: itemSchema },
      invalidatesTags: ['Items'],
    }),
    adjustItemOnHandQuantity: build.mutation<
      OnHandAdjustment,
      OnHandAdjustmentArgs
    >({
      query: ({ warehouseId, itemId, input }) => ({
        url: `${itemPath(warehouseId, itemId)}/on-hand-adjustments`,
        method: 'POST',
        body: input,
      }),
      extraOptions: { schema: onHandAdjustmentSchema },
      invalidatesTags: ['Items'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useAdjustItemOnHandQuantityMutation,
  useCreateItemMutation,
  useDeactivateItemMutation,
  useListItemsQuery,
  useReactivateItemMutation,
  useUpdateItemMutation,
} = itemApi;
