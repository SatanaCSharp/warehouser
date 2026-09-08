import {
  deliveryModeSchema,
  packagingTypeIdSchema,
  purchaseDraftStateSchema,
  rejectionDispositionSchema,
  rejectionReasonIdSchema,
  rejectionSourceSchema,
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
const maxAllocationsPerEndingLine = 50;

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
  // See `rejectionAmendSchema`: a present-but-`undefined` property must not satisfy "at least one".
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: 'At least one Purchase Draft Line field must be present',
    },
  )
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

// openapi.yaml `EndingAllocationCreate` — the Allocation is addressed through the link, not beside
// it (AC-18), which is what makes "an Allocation names a Customer Order its line is actually linked
// to" provable by the reference itself rather than re-checked in application code.
export const endingAllocationCreateSchema = z.strictObject({
  purchaseDraftLineLinkId: z.string().uuid(),
  allocatedQuantity: z.number().int().min(1),
});

// ---- arrival-inspection: the condition a line's ending is recorded with ------------------------
//
// `rejectionReasonIdSchema`, `rejectionSourceSchema`, `rejectionDispositionSchema` and
// `rejectionReasonSchema` moved to `purchase-drafts-projections.ts` (T12 prerequisite): the read
// side's condition projection needs them too, and `purchase-drafts-mutations.ts` already imports
// catalogue-shaped schemas *from* `purchase-drafts-projections.ts` rather than the other way, so
// this keeps the import direction one-way instead of opening a cycle over top-level `z.enum(...)`
// initialisation.

// openapi.yaml `RejectionDescription` and `PreReceiptConformanceNote` share one shape: a member's
// prose bounded at one thousand **characters**. `char_length`, not `octet_length` — a Ukrainian
// description must not be refused at five hundred for costing two bytes each
// (`chk_purchase_draft_line_rejections_description_length`, AC-14, AC-15b).
//
// The bound is counted in **code points**, not in `String.length`'s UTF-16 code units, because
// PostgreSQL's `char_length` counts characters: the two agree across the BMP but diverge above it,
// where one astral character costs two code units, so a `.max()` on `length` would refuse prose
// at half the stated bound that the column would have stored.
//
// Trimmed non-empty: a blank string is a refusal rather than an absence, which is what keeps
// "omitted or present with content" the only two states either property has (data-model.md).
const maxProseLength = 1000;
const proseSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => [...value].length <= maxProseLength, {
    message: `Must be at most ${String(maxProseLength)} characters`,
  });

// Upper bound on the Condition Split of one ending, mirroring `maxAllocationsPerEndingLine`. A
// payload guard rather than a business rule: the real bound is one entry per Reason (AC-09), proved
// by `uq_purchase_draft_line_rejections_line_reason`. Deliberately loose, so extending the
// catalogue never requires changing it.
const maxRejectionsPerEndingLine = 50;

// openapi.yaml `RejectionCreate` — one refusal within a line's ending, recorded **with** the ending
// and never afterwards (AC-04). The raising member, the time, the Rejection's own identifier and
// its Disposition are not inputs: the server attributes and mints them, and this object being
// strict is what refuses them rather than silently discarding them.
export const rejectionCreateSchema = z.strictObject({
  rejectionReasonId: rejectionReasonIdSchema,
  // A whole number of at least one (AC-03). That the sum across entries may not exceed the received
  // figure is a cross-field rule the command asserts against the locked line (AC-02), not a bound
  // this schema can state.
  quantity: z.number().int().min(1),
  source: rejectionSourceSchema,
  // Required when the catalogue marks the named Reason `requiresDescription` — today `unfit_other`
  // alone — and optional otherwise. That condition is the server's, asserted against the same
  // catalogue read it makes for AC-06 rather than against a hard-coded identifier (AC-07).
  description: proseSchema.optional(),
});

// openapi.yaml `PreReceiptConformanceNotMetCreate` — the supplier did not honour the frozen
// instruction. One judgement covers packaging and the value-adding note both, so the note names
// which of the two failed (AC-15, AC-15a). The note is optional: no acceptance criterion requires
// one, and `chk_purchase_draft_lines_conformance_note_shape` asks only that it never stand without
// a verdict.
export const preReceiptConformanceNotMetCreateSchema = z.strictObject({
  verdict: z.literal('not_met'),
  note: proseSchema.optional(),
});

// openapi.yaml `PreReceiptConformanceWithoutNoteCreate` — the instruction was honoured, or the line
// was frozen carrying none and there is nothing to judge. **Neither admits a note.**
export const preReceiptConformanceWithoutNoteCreateSchema = z.strictObject({
  verdict: z.enum(['met', 'not_applicable']),
});

// openapi.yaml `PreReceiptConformanceCreate` — the supplier's frozen instruction judged, submitted
// with the ending and never afterwards.
//
// The note belonging **only** to `not_met` is expressed here as two arms rather than as a database
// `CHECK`, deliberately: a `CHECK` produces an unnamed constraint violation where the server
// error-handling guide requires a named predicate and a stable code, and no acceptance criterion
// names a refusal for a note beside `met`. A 400 naming the property is the right refusal, so the
// request schema is its home (data-model.md).
//
// Which *verdicts* are legal is not expressible here at all: it depends on what the line was frozen
// with, which the server reads under lock (AC-17, AC-17a).
export const preReceiptConformanceCreateSchema = z.union([
  preReceiptConformanceNotMetCreateSchema,
  preReceiptConformanceWithoutNoteCreateSchema,
]);

// openapi.yaml `RejectionAmend` — the description, the Disposition, or both (AC-18, AC-18b).
//
// **At least one must be present**: an amendment that amends nothing would still write an
// attribution, which would make "every amendment records the acting member and the time" mean
// something it does not.
//
// Nothing else about a Rejection is addressable. Its quantity, Reason, Source and line were settled
// when the ending was recorded and there is no property for any of them here — the contract half of
// what the repository's narrow conditional `UPDATE` enforces, since this codebase has no triggers
// and column-level immutability would need one. The amending member and the time are attributed by
// the server, never accepted as input.
export const rejectionAmendSchema = z
  .strictObject({
    // Clearing is **not** offered, so this is optional rather than nullable: a Rejection naming a
    // Reason the catalogue marks `requiresDescription` must always carry prose, and a nullable
    // property here would let an amendment break an invariant the ending established. Blank after
    // trimming is a refusal, not a clear.
    description: proseSchema.optional(),
    disposition: rejectionDispositionSchema.optional(),
  })
  // `Object.values`, not `Object.keys`: an object that still carries the key with an `undefined`
  // value — which is what spreading form state produces — passes a key count while zod strips the
  // property from the parsed data, so `{ description: undefined }` would validate here and 400 at
  // the server. openapi.yaml `minProperties: 1` means a field with a value.
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: 'At least one Rejection amendment field must be present',
    },
  );

// openapi.yaml `PurchaseDraftLineArrival` — what arrived at the dock on **one Via Warehouse line**
// (AC-19). Bounded neither above nor below by `orderedQuantity`; `0` is a line where nothing
// arrived, which is an ending rather than the absence of one.
//
// The ending kind is **not** a property here and that is the point: it is the route
// (ADR 0002), so AC-20's refusal sits in front of the request rather than behind a submitted value.
// Attribution, the time and the draft's move to Closed are likewise derived, never inputs.
export const purchaseDraftLineArrivalSchema = z.strictObject({
  receivedQuantity: z.number().int().nonnegative(),
  // The Condition Split. Omitted or empty when nothing was refused — and an ending that refuses
  // nothing needs only `PURCHASE_DRAFTS:RECEIVE`, while one carrying any entry needs
  // `REJECTIONS:CREATE` as well, so this property's presence is what decides the required
  // Permission set (AC-01a, AC-01b).
  rejections: z
    .array(rejectionCreateSchema)
    .max(maxRejectionsPerEndingLine)
    .optional(),
  // Required on any line where something was received and refused on a line where nothing was
  // (AC-04a); which verdicts are legal depends on what the line was frozen with (AC-17, AC-17a).
  // Both are cross-field rules the command asserts against the locked line, not bounds statable
  // here, which is why the property itself is optional.
  preReceiptConformance: preReceiptConformanceCreateSchema.optional(),
  allocations: z
    .array(endingAllocationCreateSchema)
    .max(maxAllocationsPerEndingLine)
    .optional(),
});

// openapi.yaml `PurchaseDraftLineDirectDelivery` — what the customer received on **one Direct to
// Customer line**. Identical to the arrival payload except the name of the quantity, which says what
// actually happened: these goods never entered the building and were never in the Transit Zone to be
// counted (AC-21).
export const purchaseDraftLineDirectDeliverySchema = z.strictObject({
  deliveredQuantity: z.number().int().nonnegative(),
  // Identical to the arrival payload. The one rule that differs is carried by the entries
  // themselves: every one takes `source: customer_reported`, and one claiming `inspected` is
  // refused against the line's Delivery Mode by the server (AC-24, AC-25 mirrored).
  rejections: z
    .array(rejectionCreateSchema)
    .max(maxRejectionsPerEndingLine)
    .optional(),
  preReceiptConformance: preReceiptConformanceCreateSchema.optional(),
  allocations: z
    .array(endingAllocationCreateSchema)
    .max(maxAllocationsPerEndingLine)
    .optional(),
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
export type EndingAllocationCreate = z.infer<
  typeof endingAllocationCreateSchema
>;
export type PurchaseDraftLineArrival = z.infer<
  typeof purchaseDraftLineArrivalSchema
>;
export type PurchaseDraftLineDirectDelivery = z.infer<
  typeof purchaseDraftLineDirectDeliverySchema
>;
export type RejectionCreate = z.infer<typeof rejectionCreateSchema>;
export type PreReceiptConformanceCreate = z.infer<
  typeof preReceiptConformanceCreateSchema
>;
export type RejectionAmend = z.infer<typeof rejectionAmendSchema>;
export type PurchaseDraftClosure = z.infer<typeof purchaseDraftClosureSchema>;
