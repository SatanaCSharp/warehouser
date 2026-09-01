import {
  itemSchema,
  onHandAdjustmentSchema,
} from '@warehouser/contracts/items';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { z } from 'zod';

import { api } from 'shared/api/client/api-client';
import { fieldErrorsForCode } from 'shared/utils/field-errors';

import type {
  Item,
  ItemCreate,
  ItemUpdate,
  OnHandAdjustment,
  OnHandAdjustmentCreate,
} from '@warehouser/contracts/items';
import type { ApiFailure } from 'shared/api/client/api-client';

const itemsPath = (warehouseId: string): string =>
  `/api/v1/warehouses/${warehouseId}/items`;

const itemPath = (warehouseId: string, itemId: string): string =>
  `${itemsPath(warehouseId)}/${itemId}`;

const itemListSchema = z.array(itemSchema);

/**
 * What every write below names the Item by in the toast it raises. The frame
 * `hWFRW` tile "Success · what actually committed" requires the success copy to
 * state the outcome in the vocabulary of the page — `On-hand set to 60 · Pallet
 * wrap, 500mm`, never "On-hand quantity recorded" — and the feedback registry
 * sees a settled mutation's **arguments only**, so what the toast names has to
 * arrive in them (`shared/alerts/mutation-actions.ts`).
 *
 * They ride along exactly as `warehouseName` does on the Warehouse membership
 * commands: every `query` below names the body field by field rather than
 * rest-spreading its argument, so the server is told the identifiers and never
 * the caller's copy of the Item's own words.
 */
type ItemNaming = { sku: string; description: string };

type ItemCreateArgs = { warehouseId: string; input: ItemCreate };
type ItemUpdateArgs = ItemNaming & {
  warehouseId: string;
  itemId: string;
  input: ItemUpdate;
};
type ItemIdArgs = ItemNaming & { warehouseId: string; itemId: string };
type OnHandAdjustmentArgs = {
  /** What the counted figure is stated about, for the same reason. */
  description: string;
  input: OnHandAdjustmentCreate;
  itemId: string;
  warehouseId: string;
};

/**
 * AC-07 — a SKU already used in this Warehouse is refused as its own code and
 * belongs on the SKU field, which is where the frame draws it
 * (`s5EPi` "Add an item"). The server names no field for it, so the endpoint
 * does (web-error-handling.md §3).
 */
const createItemFieldErrors = fieldErrorsForCode({
  [ErrorCode.ITEMS_SKU_TAKEN]: { sku: 'skuTaken' },
});

/**
 * AC-06c / AC-07 — both refusals a correction can hit are about the SKU, and
 * both are explained on that field: `skuFixed` names what already holds the SKU
 * (`hWFRW` tile `A0OO9m`), `skuTaken` names the Item that already uses the new
 * one. The description and the unit stay correctable, so nothing is bound to
 * them.
 */
const updateItemFieldErrors = fieldErrorsForCode({
  [ErrorCode.ITEMS_SKU_FIXED]: { sku: 'skuFixed' },
  [ErrorCode.ITEMS_SKU_TAKEN]: { sku: 'skuTaken' },
});

/**
 * AC-09a — the missing reason is a domain refusal whose envelope names the
 * field but not a rule, so `api-client.ts` lifts no `fieldErrors` from it and
 * this table supplies the one it belongs to.
 */
const adjustmentFieldErrors = fieldErrorsForCode({
  [ErrorCode.ITEMS_ADJUSTMENT_REASON_REQUIRED]: { reason: 'required' },
});

/**
 * AC-09 — the range refusal *does* carry `details: { field, rule }`, so
 * `api-client.ts` has already lifted `{ countedQuantity: 'non_negative_integer' }`
 * out of it and the table above never sees it. What arrives is the server's own
 * rule identifier; this renames it to the validation key that explains it,
 * exactly as `nameValidationKeyMapper` does for a rejected Name, so no
 * component has to know the server's spelling.
 */
const validationKeysByRule: Record<string, string> = {
  non_negative_integer: 'nonNegativeInteger',
};

const adjustmentValidationKeys = (failure: ApiFailure): ApiFailure => {
  const rule = failure.fieldErrors?.countedQuantity;
  if (rule === undefined) {
    return failure;
  }

  return {
    ...failure,
    fieldErrors: {
      ...failure.fieldErrors,
      countedQuantity: validationKeysByRule[rule] ?? rule,
    },
  };
};

const adjustmentErrors = (failure: ApiFailure): ApiFailure =>
  adjustmentValidationKeys(adjustmentFieldErrors(failure));

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
      transformErrorResponse: createItemFieldErrors,
    }),
    updateItem: build.mutation<Item, ItemUpdateArgs>({
      query: ({ warehouseId, itemId, input }) => ({
        url: itemPath(warehouseId, itemId),
        method: 'PATCH',
        body: input,
      }),
      extraOptions: { schema: itemSchema },
      invalidatesTags: ['Items'],
      transformErrorResponse: updateItemFieldErrors,
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
      transformErrorResponse: adjustmentErrors,
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
