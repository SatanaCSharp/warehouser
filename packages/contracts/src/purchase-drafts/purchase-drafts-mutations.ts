import {
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
export const purchaseDraftLineUpdateSchema = z
  .strictObject({
    itemId: z.string().uuid().optional(),
    orderedQuantity: z.number().int().min(1).optional(),
    packagingTypeId: packagingTypeIdSchema.nullable().optional(),
    valueAddingNote: z.string().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one Purchase Draft Line field must be present',
  });

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
export type ArrivalAllocationCreate = z.infer<
  typeof arrivalAllocationCreateSchema
>;
export type ArrivalConfirmationLine = z.infer<
  typeof arrivalConfirmationLineSchema
>;
export type ArrivalConfirmation = z.infer<typeof arrivalConfirmationSchema>;
export type PurchaseDraftClosure = z.infer<typeof purchaseDraftClosureSchema>;
