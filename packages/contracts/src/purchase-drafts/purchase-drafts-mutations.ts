import {
  deliveryModeSchema,
  packagingTypeIdSchema,
  purchaseDraftStateSchema,
} from 'purchase-drafts/purchase-drafts-projections';
import { z } from 'zod';

// Every request schema below is a `strictObject`, which is what makes every derived value of this
// subpath unsubmittable: openapi.yaml records that a Demand Line, a Coverage figure and a Drift
// Signal are all derived on every read, and no endpoint accepts one as input. `state`,
// `hasDriftSignal`, `driftSignals`, `snapshot`, `current`, `allocation` and `receivedQuantity` are
// therefore absent from every request shape and refused outright rather than silently discarded.

// openapi.yaml `PurchaseDraftLineLinkCreate` — a link states how much of the line is intended for a
// Customer Order (AC-10, AC-11a).
export const purchaseDraftLineLinkCreateSchema = z.strictObject({
  customerOrderId: z.string().uuid(),
  statedQuantity: z.number().int().min(1),
});

// openapi.yaml `PurchaseDraftLineLinkUpdate` — re-quantifies an existing link (AC-11a).
export const purchaseDraftLineLinkUpdateSchema = z.strictObject({
  statedQuantity: z.number().int().min(1),
});

// Upper bounds on every request-body array of this subpath. They are payload guards, not business
// rules: nothing in spec.md limits how many lines a draft may hold, and a member will never reach
// these figures — a purchase order of two hundred distinct Items, each intended for fifty Customer
// Orders, is already far past what anyone assembles by hand. What an unbounded array buys an
// attacker is the reason they exist: every malformed element of a rejected array produces an issue
// per property, and the server turns those issues into `details.fields` synchronously, before any
// route code runs and before any rate limiter can see the request (NestJS runs guards ahead of
// pipes). Bounding the array bounds the work one request can buy.
const maxDraftLines = 200;
const maxLinksPerLine = 50;
const maxAllocationsPerArrivalLine = 50;

// openapi.yaml `PurchaseDraftLineCreate` — one Item, quantity, optional Pre-receipt Requirement and
// optional links (AC-10, AC-11, AC-12, AC-13).
export const purchaseDraftLineCreateSchema = z.strictObject({
  itemId: z.string().uuid(),
  orderedQuantity: z.number().int().min(1),
  packagingTypeId: packagingTypeIdSchema.nullable().optional(),
  valueAddingNote: z.string().min(1).nullable().optional(),
  links: z
    .array(purchaseDraftLineLinkCreateSchema)
    .max(maxLinksPerLine)
    .optional(),
});

// openapi.yaml `PurchaseDraftLineUpdate` — every property optional; at least one must be present
// (AC-10a, AC-12, AC-13). `null` on either half of the Pre-receipt Requirement clears it.
//
// **Changed by this feature:** `deliveryMode` and `customerDeliveryAddressId`. Links are managed
// through their own sub-resource, not here, and no frozen column is submittable at all — this
// object is strict, so `frozenDeliveryAddressText`, `frozenAccessNotes`, `frozenCustomerName` and
// both projected destinations are refused rather than ignored (AC-17).
//
// The two destination properties are accepted **only** while the draft is in `draft`. After Ready
// for Ordering they are unwritable by construction rather than by a check: the write path resolves
// no frozen draft at all.
export const purchaseDraftLineUpdateSchema = z
  .strictObject({
    itemId: z.string().uuid().optional(),
    orderedQuantity: z.number().int().min(1).optional(),
    packagingTypeId: packagingTypeIdSchema.nullable().optional(),
    valueAddingNote: z.string().min(1).nullable().optional(),
    deliveryMode: deliveryModeSchema.optional(),
    // An **active** Delivery Address of a Customer of this Warehouse, proven by the composite
    // reference `(id, warehouse_id)` (AC-12). The Warehouse's own Delivery Address has no
    // identifier this property could hold, so naming it here is structurally impossible; AC-14's
    // refusal is about the member's submitted intent and is bound to this field, and is decided by
    // the command rather than here.
    customerDeliveryAddressId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one Purchase Draft Line field must be present',
  })
  // openapi.yaml `dependentRequired: { customerDeliveryAddressId: [deliveryMode] }` — "an address
  // with no mode" is not a payload this endpoint has a meaning for. Bound to the field so the
  // refusal names it.
  .refine(
    (value) =>
      value.customerDeliveryAddressId === undefined ||
      value.deliveryMode !== undefined,
    {
      path: ['customerDeliveryAddressId'],
      message: 'A Customer Delivery Address states the Delivery Mode with it',
    },
  )
  // `chk_purchase_draft_lines_delivery_mode_address` as a payload rule, refused at 400 rather than
  // left to the database: a Via Warehouse line's destination *is* the Warehouse's own address and
  // there is no identifier to keep, so setting `via_warehouse` clears it (AC-13). Stating
  // `via_warehouse` with an address is a contradiction, not a clearance, and is refused; stating it
  // with `null` or with the key absent is the clearance.
  .refine(
    (value) =>
      value.deliveryMode !== 'via_warehouse' ||
      (value.customerDeliveryAddressId ?? null) === null,
    {
      path: ['customerDeliveryAddressId'],
      message: 'A Via Warehouse line names no Customer Delivery Address',
    },
  );

// openapi.yaml `PurchaseDraftCreate` — state, attribution and time are not inputs (AC-10, AC-10a).
export const purchaseDraftCreateSchema = z.strictObject({
  expectedArrivalDate: z.string().date().nullable().optional(),
  lines: z.array(purchaseDraftLineCreateSchema).max(maxDraftLines),
});

// openapi.yaml `PurchaseDraftRevise` — the one draft-level field a member may still change while the
// draft is in the Draft state; `null` clears it.
export const purchaseDraftReviseSchema = z.strictObject({
  expectedArrivalDate: z.string().date().nullable(),
});

// `GET .../purchase-drafts` query parameters (openapi.yaml `listPurchaseDrafts`) — `state` narrows
// to one draft state; omitted returns every state.
export const purchaseDraftListQuerySchema = z.strictObject({
  state: purchaseDraftStateSchema.optional(),
});

// `GET .../purchase-draft-lines` query parameters (openapi.yaml `listPurchaseDraftLines`) — the
// by-line read narrowed by the Delivery Mode that places a line in one half or the other, and by
// draft state. Omitting both returns every line of the acting Warehouse (AC-22).
export const purchaseDraftLineListQuerySchema = z.strictObject({
  deliveryMode: deliveryModeSchema.optional(),
  state: purchaseDraftStateSchema.optional(),
});

// openapi.yaml `ArrivalAllocationCreate` — the Allocation is addressed through the link, not beside
// it (AC-18).
export const arrivalAllocationCreateSchema = z.strictObject({
  purchaseDraftLineLinkId: z.string().uuid(),
  allocatedQuantity: z.number().int().min(1),
});

// openapi.yaml `ArrivalConfirmationLine` — whatever physically arrived, bounded neither above nor
// below by `orderedQuantity` (AC-17, AC-17b).
export const arrivalConfirmationLineSchema = z.strictObject({
  purchaseDraftLineId: z.string().uuid(),
  receivedQuantity: z.number().int().nonnegative(),
  allocations: z
    .array(arrivalAllocationCreateSchema)
    .max(maxAllocationsPerArrivalLine)
    .optional(),
});

// openapi.yaml `ArrivalConfirmation` — one confirmation covers every line of the draft (AC-17,
// AC-17b). Attribution and the move to Closed are not inputs.
export const arrivalConfirmationSchema = z.strictObject({
  // The ceiling matches `maxDraftLines`: a confirmation covers every line of the draft, so it can
  // never legitimately name more lines than a draft may hold.
  lines: z.array(arrivalConfirmationLineSchema).min(1).max(maxDraftLines),
});

// openapi.yaml `PurchaseDraftClosure` — why the supplier could not fulfil the order (AC-21).
export const purchaseDraftClosureSchema = z.strictObject({
  closureReason: z.string().min(1),
});

export type PurchaseDraftLineLinkCreate = z.infer<
  typeof purchaseDraftLineLinkCreateSchema
>;
export type PurchaseDraftLineLinkUpdate = z.infer<
  typeof purchaseDraftLineLinkUpdateSchema
>;
export type PurchaseDraftLineCreate = z.infer<
  typeof purchaseDraftLineCreateSchema
>;
export type PurchaseDraftLineUpdate = z.infer<
  typeof purchaseDraftLineUpdateSchema
>;
export type PurchaseDraftCreate = z.infer<typeof purchaseDraftCreateSchema>;
export type PurchaseDraftRevise = z.infer<typeof purchaseDraftReviseSchema>;
export type PurchaseDraftListQuery = z.infer<
  typeof purchaseDraftListQuerySchema
>;
export type PurchaseDraftLineListQuery = z.infer<
  typeof purchaseDraftLineListQuerySchema
>;
export type ArrivalAllocationCreate = z.infer<
  typeof arrivalAllocationCreateSchema
>;
export type ArrivalConfirmationLine = z.infer<
  typeof arrivalConfirmationLineSchema
>;
export type ArrivalConfirmation = z.infer<typeof arrivalConfirmationSchema>;
export type PurchaseDraftClosure = z.infer<typeof purchaseDraftClosureSchema>;
