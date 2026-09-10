import type {
  PackagingType,
  PurchaseDraftClosure,
  PurchaseDraftDetail,
  PurchaseDraftLineArrival,
  PurchaseDraftLineCreate,
  PurchaseDraftLineDirectDelivery,
  PurchaseDraftLineLinkCreate,
  PurchaseDraftLineListEntry,
  PurchaseDraftLineUpdate,
  PurchaseDraftState,
  PurchaseDraftSummary,
  RejectionAmend,
  RejectionAmendment,
  RejectionReason,
} from '@warehouser/contracts/purchase-drafts';
import {
  packagingTypeSchema,
  purchaseDraftDetailSchema,
  purchaseDraftLineListEntrySchema,
  purchaseDraftSummarySchema,
  rejectionAmendmentSchema,
  rejectionReasonSchema,
} from '@warehouser/contracts/purchase-drafts';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { api } from 'shared/api/client/api-client';
import { fieldErrorsForCode } from 'shared/utils/field-errors';
import { z } from 'zod';

const packagingTypesPath = (warehouseId: string): string =>
  `/api/v1/warehouses/${warehouseId}/packaging-types`;

// T15 — served at its own top-level segment rather than nested under
// `/purchase-drafts`, mirroring `packagingTypesPath`, so no literal segment
// competes with a `{purchaseDraftId}` parameter (contracts/openapi.yaml).
const rejectionReasonsPath = (warehouseId: string): string =>
  `/api/v1/warehouses/${warehouseId}/rejection-reasons`;

/**
 * BRIEF §A — which field explains a refusal the server named none for. A Zod
 * request-validation failure already arrives with `details.fields`, and
 * `fieldErrorsForCode` leaves those untouched: these tables answer only for the
 * **domain** refusals, which are `ApplicationError`s with their own envelope and
 * no field of their own (web-error-handling.md §3).
 *
 * The codes below are the ones the write-path hardening settled on, and two of
 * them moved: adding a line or a link against a draft that is absent or another
 * Warehouse's is now 404 `target_unavailable` rather than 409 `draft_frozen`,
 * and so is naming a deactivated Item — deliberately the same code as a
 * cross-Warehouse Item, so the refusal does not disclose that the Item exists
 * here (AC-11, frame `hWFRW` tile "Another warehouse's item").
 */
const addLineFieldErrors = fieldErrorsForCode({
  [ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE]: { itemId: 'unavailable' },
  [ErrorCode.PURCHASE_DRAFTS_DRAFT_FROZEN]: { orderedQuantity: 'frozen' },
  [ErrorCode.PURCHASE_DRAFTS_UNKNOWN_PACKAGING_TYPE]: {
    packagingTypeId: 'unknown',
  },
});

const reviseDraftFieldErrors = fieldErrorsForCode({
  [ErrorCode.PURCHASE_DRAFTS_DRAFT_FROZEN]: { expectedArrivalDate: 'frozen' },
});

const addLinkFieldErrors = fieldErrorsForCode({
  [ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE]: {
    customerOrderId: 'unavailable',
  },
  [ErrorCode.PURCHASE_DRAFTS_LINK_EXISTS]: { customerOrderId: 'exists' },
  [ErrorCode.PURCHASE_DRAFTS_DRAFT_FROZEN]: { customerOrderId: 'frozen' },
});

const closureFieldErrors = fieldErrorsForCode({
  [ErrorCode.PURCHASE_DRAFTS_INVALID_STATE]: { closureReason: 'invalidState' },
});

const purchaseDraftSummaryListSchema = z.array(purchaseDraftSummarySchema);
const purchaseDraftLineListSchema = z.array(purchaseDraftLineListEntrySchema);
const packagingTypeListSchema = z.array(packagingTypeSchema);
const rejectionReasonListSchema = z.array(rejectionReasonSchema);

type ListPurchaseDraftsArgs = {
  warehouseId: string;
  state?: PurchaseDraftState;
};
type ListPurchaseDraftLinesArgs = {
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
type ClosePurchaseDraftArgs = PurchaseDraftIdArgs & {
  input: PurchaseDraftClosure;
};
// T17/ADR 0002 — an ending is per line, and its **kind is the route**: the two argument types
// differ only in which endpoint they reach, which is what keeps a member from recording a dock
// arrival against a line the goods never came to (AC-20).
type RecordLineArrivalArgs = LineIdArgs & {
  input: PurchaseDraftLineArrival;
};
type RecordLineDirectDeliveryArgs = LineIdArgs & {
  input: PurchaseDraftLineDirectDelivery;
};
// T18 — AC-18/AC-18a/AC-18b/AC-19/AC-20: a Rejection amended after the draft
// closed. `rejectionId` names the sub-resource; the amendment carries no
// Reason, quantity, Source or line (`rejectionAmendSchema`).
type AmendRejectionArgs = LineIdArgs & {
  rejectionId: string;
  input: RejectionAmend;
};

/**
 * Every Warehouse-scoped Purchase Drafts path, built from the same argument
 * objects the endpoints already take. Taking the arguments whole rather than
 * positionally is what keeps each endpoint's `query` a one-liner and makes a
 * transposed pair of ids impossible to write.
 */
const purchaseDraftsPath = (warehouseId: string): string =>
  `/api/v1/warehouses/${warehouseId}/purchase-drafts`;

/**
 * AC-22's by-line read, served at the **top level** rather than as
 * `/purchase-drafts/lines`, so no literal segment competes with a
 * `{purchaseDraftId}` parameter — the same reason `/packaging-types` is served
 * there (contracts/openapi.yaml, sad.md §7).
 */
const purchaseDraftLineListPath = (warehouseId: string): string =>
  `/api/v1/warehouses/${warehouseId}/purchase-draft-lines`;

const purchaseDraftPath = ({
  warehouseId,
  purchaseDraftId,
}: PurchaseDraftIdArgs): string =>
  `${purchaseDraftsPath(warehouseId)}/${purchaseDraftId}`;

const purchaseDraftLinesPath = (args: PurchaseDraftIdArgs): string =>
  `${purchaseDraftPath(args)}/lines`;

const purchaseDraftLinePath = (args: LineIdArgs): string =>
  `${purchaseDraftLinesPath(args)}/${args.purchaseDraftLineId}`;

const purchaseDraftLineLinksPath = (args: LineIdArgs): string =>
  `${purchaseDraftLinePath(args)}/links`;

const purchaseDraftLineLinkPath = (args: LinkIdArgs): string =>
  `${purchaseDraftLineLinksPath(args)}/${args.purchaseDraftLineLinkId}`;

const purchaseDraftReadinessPath = (args: PurchaseDraftIdArgs): string =>
  `${purchaseDraftPath(args)}/readiness`;

const purchaseDraftLineArrivalPath = (args: LineIdArgs): string =>
  `${purchaseDraftLinePath(args)}/arrival`;

const purchaseDraftLineDirectDeliveryPath = (args: LineIdArgs): string =>
  `${purchaseDraftLinePath(args)}/direct-delivery`;

const purchaseDraftClosurePath = (args: PurchaseDraftIdArgs): string =>
  `${purchaseDraftPath(args)}/closure`;

const purchaseDraftLineRejectionPath = (args: AmendRejectionArgs): string =>
  `${purchaseDraftLinePath(args)}/rejections/${args.rejectionId}`;

/**
 * The Warehouse's Purchase Drafts endpoints (sad.md §5 `purchase-drafts/usecases`, T20).
 * Every write re-reads the full draft (contracts/openapi.yaml), so a mutation invalidates
 * whole tags rather than patching a cache entry by hand — the same choice `item-api.ts`
 * makes for the Item catalogue, at this feature's own scale (spec.md §1).
 *
 * **Which tags each write invalidates is decided per mutation, not blanket-applied**, from
 * what the server's own projections read:
 *
 * - `Demand`, because the consolidated demand's coverage subquery aggregates every Line Link
 *   whose draft is in `('draft', 'ready_for_ordering')` and carries that draft's state and the
 *   link's stated quantity into the `Covered by` chips
 *   (`consolidated-demand.repository.ts`). So writing a link, removing the line that holds it,
 *   or moving the draft into or out of those two states all change what the Demand table shows
 *   — and an Arrival Confirmation fulfils Customer Orders, which drops their rows from it
 *   entirely (AC-17b, frame `s5EPi`).
 * - `Items`, because `namingPurchaseDraftLineCount` counts the Purchase Draft Lines naming an
 *   Item, with no draft-state filter (`item-catalogue.repository.ts`), and the Items table
 *   renders it as `Named by 3 customer orders and 1 draft line` (AC-06c, frame `XIvAZ`). Only
 *   adding, removing or re-pointing a **line** moves that figure.
 *
 * A write that moves neither figure carries neither tag, so a member editing the expected
 * arrival date does not refetch two other destinations.
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
    // AC-22 — the Warehouse's lines with their Delivery Modes, so the dock-bound
    // half is kept apart from the directly-shipped one. It reads the same
    // records the drafts list reads, so it carries the same tag and every write
    // that moves a line's mode or destination refreshes it with the drafts.
    listPurchaseDraftLines: build.query<
      PurchaseDraftLineListEntry[],
      ListPurchaseDraftLinesArgs
    >({
      query: ({ warehouseId, state }) => ({
        url: purchaseDraftLineListPath(warehouseId),
        params: state ? { state } : undefined,
      }),
      extraOptions: { schema: purchaseDraftLineListSchema },
      providesTags: ['PurchaseDrafts'],
    }),
    getPurchaseDraft: build.query<PurchaseDraftDetail, PurchaseDraftIdArgs>({
      query: purchaseDraftPath,
      extraOptions: { schema: purchaseDraftDetailSchema },
      providesTags: ['PurchaseDrafts'],
    }),
    listPackagingTypes: build.query<PackagingType[], string>({
      query: (warehouseId) => packagingTypesPath(warehouseId),
      extraOptions: { schema: packagingTypeListSchema },
      providesTags: ['PackagingTypes'],
    }),
    // T15 — the Rejection Reason catalogue (AC-06/AC-07). System-managed reference data, workspace-wide
    // like Packaging Types, so it carries its own tag rather than `PurchaseDrafts` and never invalidates
    // on a draft write: this feature adds no mutation that changes the catalogue.
    listRejectionReasons: build.query<RejectionReason[], string>({
      query: (warehouseId) => rejectionReasonsPath(warehouseId),
      extraOptions: { schema: rejectionReasonListSchema },
      providesTags: ['RejectionReasons'],
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
      // A draft is created empty (`body: { lines: [] }`), so it names no Item and covers
      // no demand until a line is added.
      invalidatesTags: ['PurchaseDrafts'],
    }),
    revisePurchaseDraft: build.mutation<
      PurchaseDraftDetail,
      RevisePurchaseDraftArgs
    >({
      query: (args) => ({
        url: purchaseDraftPath(args),
        method: 'PATCH',
        body: args.input,
      }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      // The Expected Arrival Date is the draft's alone; neither projection reads it.
      invalidatesTags: ['PurchaseDrafts'],
      transformErrorResponse: reviseDraftFieldErrors,
    }),
    addPurchaseDraftLine: build.mutation<PurchaseDraftDetail, AddLineArgs>({
      query: (args) => ({
        url: purchaseDraftLinesPath(args),
        method: 'POST',
        body: args.input,
      }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      // The new line names an Item, and `PurchaseDraftLineCreate` may carry its links
      // with it (`purchase-drafts-mutations.ts`), so both projections move.
      invalidatesTags: ['Demand', 'Items', 'PurchaseDrafts'],
      transformErrorResponse: addLineFieldErrors,
    }),
    revisePurchaseDraftLine: build.mutation<
      PurchaseDraftDetail,
      ReviseLineArgs
    >({
      query: (args) => ({
        url: purchaseDraftLinePath(args),
        method: 'PATCH',
        body: args.input,
      }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      // Restating `itemId` moves one naming count off one Item and onto another. It
      // touches no link, and coverage is keyed by the link's Customer Order rather than
      // by the line's Item, so the demand reading is unchanged.
      invalidatesTags: ['Items', 'PurchaseDrafts'],
      transformErrorResponse: addLineFieldErrors,
    }),
    removePurchaseDraftLine: build.mutation<PurchaseDraftDetail, LineIdArgs>({
      query: (args) => ({ url: purchaseDraftLinePath(args), method: 'DELETE' }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      // The line stops naming its Item and takes its links — and therefore its coverage
      // of every Customer Order they named — with it.
      invalidatesTags: ['Demand', 'Items', 'PurchaseDrafts'],
    }),
    addPurchaseDraftLineLink: build.mutation<PurchaseDraftDetail, AddLinkArgs>({
      query: (args) => ({
        url: purchaseDraftLineLinksPath(args),
        method: 'POST',
        body: args.input,
      }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      // A link, and the quantity stated on it, is exactly what a `Covered by` chip
      // reads (AC-11a). The line's Item is untouched.
      invalidatesTags: ['Demand', 'PurchaseDrafts'],
      transformErrorResponse: addLinkFieldErrors,
    }),
    revisePurchaseDraftLineLink: build.mutation<
      PurchaseDraftDetail,
      ReviseLinkArgs
    >({
      query: (args) => ({
        url: purchaseDraftLineLinkPath(args),
        method: 'PATCH',
        body: { statedQuantity: args.statedQuantity },
      }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      // A link, and the quantity stated on it, is exactly what a `Covered by` chip
      // reads (AC-11a). The line's Item is untouched.
      invalidatesTags: ['Demand', 'PurchaseDrafts'],
    }),
    removePurchaseDraftLineLink: build.mutation<
      PurchaseDraftDetail,
      LinkIdArgs
    >({
      query: (args) => ({
        url: purchaseDraftLineLinkPath(args),
        method: 'DELETE',
      }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      // A link, and the quantity stated on it, is exactly what a `Covered by` chip
      // reads (AC-11a). The line's Item is untouched.
      invalidatesTags: ['Demand', 'PurchaseDrafts'],
    }),
    // AC-14/AC-14a — freezes the draft; T21's dialogs are the only callers.
    readyPurchaseDraft: build.mutation<
      PurchaseDraftDetail,
      PurchaseDraftIdArgs
    >({
      query: (args) => ({
        url: purchaseDraftReadinessPath(args),
        method: 'POST',
      }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      // The coverage chips carry each covering draft's state, so freezing one changes
      // what the Demand table shows even though the draft stays within the two states
      // the subquery counts.
      invalidatesTags: ['Demand', 'PurchaseDrafts'],
    }),
    // AC-19/AC-20/AC-21 — records what arrived at the dock on one **Via Warehouse** line and its
    // Allocations. The draft closes only when this was its last line without an ending, which the
    // server decides; nothing here assumes it.
    recordPurchaseDraftLineArrival: build.mutation<
      PurchaseDraftDetail,
      RecordLineArrivalArgs
    >({
      query: (args) => ({
        url: purchaseDraftLineArrivalPath(args),
        method: 'POST',
        body: args.input,
      }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      // The Allocations fulfil Customer Orders, which leave the consolidated demand
      // altogether (`Sudhafen Handel KG becomes fulfilled and leaves the consolidated
      // demand`, frame `s5EPi`), and the draft may close out of the covering states. On-hand
      // quantities are deliberately not touched, so the Item catalogue is unchanged (AC-21).
      // The same Allocations are what a Customer is still waiting for:
      // `customerAwaitingOrderSchema` carries only Unfulfilled orders with a positive
      // `outstandingQuantity`, so an ending both empties and shortens that list.
      invalidatesTags: ['Customers', 'Demand', 'PurchaseDrafts'],
    }),
    // AC-19/AC-20/AC-21 — records what the customer received on one **Direct to Customer** line.
    // Identical in every respect except the route and the name of the quantity: these goods never
    // entered the building, so no On-hand Quantity moves for a second reason.
    recordPurchaseDraftLineDirectDelivery: build.mutation<
      PurchaseDraftDetail,
      RecordLineDirectDeliveryArgs
    >({
      query: (args) => ({
        url: purchaseDraftLineDirectDeliveryPath(args),
        method: 'POST',
        body: args.input,
      }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      invalidatesTags: ['Customers', 'Demand', 'PurchaseDrafts'],
    }),
    // AC-21 — closes a frozen draft the supplier cannot fulfil, with a reason.
    closePurchaseDraft: build.mutation<
      PurchaseDraftDetail,
      ClosePurchaseDraftArgs
    >({
      query: (args) => ({
        url: purchaseDraftClosurePath(args),
        method: 'POST',
        body: args.input,
      }),
      extraOptions: { schema: purchaseDraftDetailSchema },
      // A closed draft stops covering demand (AC-21). Its lines survive as the record of
      // what was ordered, so they keep naming their Items.
      invalidatesTags: ['Demand', 'PurchaseDrafts'],
      transformErrorResponse: closureFieldErrors,
    }),
    // AC-24/AC-24a — discards a draft never made ready; the response is the
    // draft's own `PurchaseDraftSummary`, not its full detail (contracts/openapi.yaml).
    discardPurchaseDraft: build.mutation<
      PurchaseDraftSummary,
      PurchaseDraftIdArgs
    >({
      query: (args) => ({ url: purchaseDraftPath(args), method: 'DELETE' }),
      extraOptions: { schema: purchaseDraftSummarySchema },
      // A discarded draft leaves the two states coverage is counted over (AC-24); like a
      // closed one, its lines stay on the record and keep naming their Items.
      invalidatesTags: ['Demand', 'PurchaseDrafts'],
    }),
    // T18 — AC-18/AC-18a/AC-18b/AC-19/AC-20: the product's first write aimed at a Closed
    // draft (sad.md §6.4). The response is the amendment, not the Rejection — no quantity,
    // Reason, Source or line moves, so this touches no other read: `Demand` and `Items` both
    // key off a link or a line's Item, neither of which this endpoint ever writes.
    amendPurchaseDraftLineRejection: build.mutation<
      RejectionAmendment,
      AmendRejectionArgs
    >({
      query: (args) => ({
        url: purchaseDraftLineRejectionPath(args),
        method: 'PATCH',
        body: args.input,
      }),
      extraOptions: { schema: rejectionAmendmentSchema },
      // Refreshes the closed draft that carries this Rejection, so the read row
      // updates without a manual refetch.
      invalidatesTags: ['PurchaseDrafts'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListPurchaseDraftsQuery,
  useListPurchaseDraftLinesQuery,
  useGetPurchaseDraftQuery,
  useListPackagingTypesQuery,
  useListRejectionReasonsQuery,
  useCreatePurchaseDraftMutation,
  useRevisePurchaseDraftMutation,
  useAddPurchaseDraftLineMutation,
  useRevisePurchaseDraftLineMutation,
  useRemovePurchaseDraftLineMutation,
  useAddPurchaseDraftLineLinkMutation,
  useRevisePurchaseDraftLineLinkMutation,
  useRemovePurchaseDraftLineLinkMutation,
  useReadyPurchaseDraftMutation,
  useRecordPurchaseDraftLineArrivalMutation,
  useRecordPurchaseDraftLineDirectDeliveryMutation,
  useClosePurchaseDraftMutation,
  useDiscardPurchaseDraftMutation,
  useAmendPurchaseDraftLineRejectionMutation,
} = purchaseDraftApi;
