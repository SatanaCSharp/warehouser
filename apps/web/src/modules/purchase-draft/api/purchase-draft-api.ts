import {
  packagingTypeSchema,
  purchaseDraftDetailSchema,
  purchaseDraftSummarySchema,
} from '@warehouser/contracts/purchase-drafts';
import { z } from 'zod';

import { api } from 'shared/api/client/api-client';

import type {
  PackagingType,
  PurchaseDraftDetail,
  PurchaseDraftLineCreate,
  PurchaseDraftLineLinkCreate,
  PurchaseDraftLineUpdate,
  PurchaseDraftState,
  PurchaseDraftSummary,
} from '@warehouser/contracts/purchase-drafts';

const purchaseDraftsPath = (warehouseId: string): string =>
  `/api/v1/warehouses/${warehouseId}/purchase-drafts`;

const purchaseDraftPath = (
  warehouseId: string,
  purchaseDraftId: string,
): string => `${purchaseDraftsPath(warehouseId)}/${purchaseDraftId}`;

const purchaseDraftLinesPath = (
  warehouseId: string,
  purchaseDraftId: string,
): string => `${purchaseDraftPath(warehouseId, purchaseDraftId)}/lines`;

const purchaseDraftLinePath = (
  warehouseId: string,
  purchaseDraftId: string,
  purchaseDraftLineId: string,
): string =>
  `${purchaseDraftLinesPath(warehouseId, purchaseDraftId)}/${purchaseDraftLineId}`;

const purchaseDraftLineLinksPath = (
  warehouseId: string,
  purchaseDraftId: string,
  purchaseDraftLineId: string,
): string =>
  `${purchaseDraftLinePath(warehouseId, purchaseDraftId, purchaseDraftLineId)}/links`;

const purchaseDraftLineLinkPath = (
  warehouseId: string,
  purchaseDraftId: string,
  purchaseDraftLineId: string,
  purchaseDraftLineLinkId: string,
): string =>
  `${purchaseDraftLineLinksPath(warehouseId, purchaseDraftId, purchaseDraftLineId)}/${purchaseDraftLineLinkId}`;

const packagingTypesPath = (warehouseId: string): string =>
  `/api/v1/warehouses/${warehouseId}/packaging-types`;

const purchaseDraftSummaryListSchema = z.array(purchaseDraftSummarySchema);
const packagingTypeListSchema = z.array(packagingTypeSchema);

type ListPurchaseDraftsArgs = {
  warehouseId: string;
  state?: PurchaseDraftState;
};
type PurchaseDraftIdArgs = { warehouseId: string; purchaseDraftId: string };
type RevisePurchaseDraftArgs = PurchaseDraftIdArgs & {
  input: { expectedArrivalDate: string | null };
};
type AddLineArgs = PurchaseDraftIdArgs & { input: PurchaseDraftLineCreate };
type ReviseLineArgs = PurchaseDraftIdArgs & {
  purchaseDraftLineId: string;
  input: PurchaseDraftLineUpdate;
};
type LineIdArgs = PurchaseDraftIdArgs & { purchaseDraftLineId: string };
type AddLinkArgs = LineIdArgs & { input: PurchaseDraftLineLinkCreate };
type ReviseLinkArgs = PurchaseDraftIdArgs & {
  purchaseDraftLineId: string;
  purchaseDraftLineLinkId: string;
  statedQuantity: number;
};
type LinkIdArgs = PurchaseDraftIdArgs & {
  purchaseDraftLineId: string;
  purchaseDraftLineLinkId: string;
};

/**
 * The Warehouse's Purchase Drafts endpoints (sad.md §5 `purchase-drafts/usecases`, T20).
 * Every write re-reads the full draft (contracts/openapi.yaml), so a mutation invalidates
 * the one `PurchaseDrafts` tag rather than patching a cache entry by hand — the same choice
 * `item-api.ts` makes for the Item catalogue, at this feature's own scale (spec.md §1).
 */
export const purchaseDraftApi = api.injectEndpoints({
  endpoints: (build) => ({
    listPurchaseDrafts: build.query<
      PurchaseDraftSummary[],
      ListPurchaseDraftsArgs
    >({
      query: ({ warehouseId, state }) => ({
        url: purchaseDraftsPath(warehouseId),
        params: state ? { state } : undefined,
      }),
      extraOptions: { schema: purchaseDraftSummaryListSchema },
      providesTags: ['PurchaseDrafts'],
    }),
    getPurchaseDraft: build.query<PurchaseDraftDetail, PurchaseDraftIdArgs>({
      query: ({ warehouseId, purchaseDraftId }) =>
        purchaseDraftPath(warehouseId, purchaseDraftId),
      extraOptions: { schema: purchaseDraftDetailSchema },
      providesTags: ['PurchaseDrafts'],
    }),
    listPackagingTypes: build.query<PackagingType[], string>({
      query: (warehouseId) => packagingTypesPath(warehouseId),
      extraOptions: { schema: packagingTypeListSchema },
      providesTags: ['PackagingTypes'],
    }),
    createPurchaseDraft: build.mutation<
      PurchaseDraftDetail,
      { warehouseId: string }
    >({
      query: ({ warehouseId }) => ({
        url: purchaseDraftsPath(warehouseId),
        method: 'POST',
        body: { lines: [] },
      }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      invalidatesTags: ['PurchaseDrafts'],
    }),
    revisePurchaseDraft: build.mutation<
      PurchaseDraftDetail,
      RevisePurchaseDraftArgs
    >({
      query: ({ warehouseId, purchaseDraftId, input }) => ({
        url: purchaseDraftPath(warehouseId, purchaseDraftId),
        method: 'PATCH',
        body: input,
      }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      invalidatesTags: ['PurchaseDrafts'],
    }),
    addPurchaseDraftLine: build.mutation<PurchaseDraftDetail, AddLineArgs>({
      query: ({ warehouseId, purchaseDraftId, input }) => ({
        url: purchaseDraftLinesPath(warehouseId, purchaseDraftId),
        method: 'POST',
        body: input,
      }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      invalidatesTags: ['PurchaseDrafts'],
    }),
    revisePurchaseDraftLine: build.mutation<
      PurchaseDraftDetail,
      ReviseLineArgs
    >({
      query: ({
        warehouseId,
        purchaseDraftId,
        purchaseDraftLineId,
        input,
      }) => ({
        url: purchaseDraftLinePath(
          warehouseId,
          purchaseDraftId,
          purchaseDraftLineId,
        ),
        method: 'PATCH',
        body: input,
      }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      invalidatesTags: ['PurchaseDrafts'],
    }),
    removePurchaseDraftLine: build.mutation<PurchaseDraftDetail, LineIdArgs>({
      query: ({ warehouseId, purchaseDraftId, purchaseDraftLineId }) => ({
        url: purchaseDraftLinePath(
          warehouseId,
          purchaseDraftId,
          purchaseDraftLineId,
        ),
        method: 'DELETE',
      }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      invalidatesTags: ['PurchaseDrafts'],
    }),
    addPurchaseDraftLineLink: build.mutation<PurchaseDraftDetail, AddLinkArgs>({
      query: ({
        warehouseId,
        purchaseDraftId,
        purchaseDraftLineId,
        input,
      }) => ({
        url: purchaseDraftLineLinksPath(
          warehouseId,
          purchaseDraftId,
          purchaseDraftLineId,
        ),
        method: 'POST',
        body: input,
      }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      invalidatesTags: ['PurchaseDrafts'],
    }),
    revisePurchaseDraftLineLink: build.mutation<
      PurchaseDraftDetail,
      ReviseLinkArgs
    >({
      query: ({
        warehouseId,
        purchaseDraftId,
        purchaseDraftLineId,
        purchaseDraftLineLinkId,
        statedQuantity,
      }) => ({
        url: purchaseDraftLineLinkPath(
          warehouseId,
          purchaseDraftId,
          purchaseDraftLineId,
          purchaseDraftLineLinkId,
        ),
        method: 'PATCH',
        body: { statedQuantity },
      }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      invalidatesTags: ['PurchaseDrafts'],
    }),
    removePurchaseDraftLineLink: build.mutation<
      PurchaseDraftDetail,
      LinkIdArgs
    >({
      query: ({
        warehouseId,
        purchaseDraftId,
        purchaseDraftLineId,
        purchaseDraftLineLinkId,
      }) => ({
        url: purchaseDraftLineLinkPath(
          warehouseId,
          purchaseDraftId,
          purchaseDraftLineId,
          purchaseDraftLineLinkId,
        ),
        method: 'DELETE',
      }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      invalidatesTags: ['PurchaseDrafts'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListPurchaseDraftsQuery,
  useGetPurchaseDraftQuery,
  useListPackagingTypesQuery,
  useCreatePurchaseDraftMutation,
  useRevisePurchaseDraftMutation,
  useAddPurchaseDraftLineMutation,
  useRevisePurchaseDraftLineMutation,
  useRemovePurchaseDraftLineMutation,
  useAddPurchaseDraftLineLinkMutation,
  useRevisePurchaseDraftLineLinkMutation,
  useRemovePurchaseDraftLineLinkMutation,
} = purchaseDraftApi;
