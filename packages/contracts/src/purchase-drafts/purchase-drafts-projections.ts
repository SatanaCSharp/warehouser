import {
  customerOrderStateSchema,
  customerRefSchema,
} from 'customer-orders/customer-orders-projections';
import {
  accessNotesSchema,
  addressTextSchema,
  customerOrderDestinationSchema,
} from 'customers/customers-projections';
import { unitOfMeasureSchema } from 'items/items-projections';
import { z } from 'zod';

// openapi.yaml `PackagingTypeId` — pattern-checked rather than enumerated, exactly as the column is
// (`packaging_types.id`), so a later migration adds an entry with no schema change and no contract
// change (CONTEXT.md §Invariants, AC-13).
export const packagingTypeIdSchema = z
  .string()
  .max(32)
  .regex(/^[a-z][a-z0-9_]*$/u);

// openapi.yaml `PackagingType` — one catalogue row (AC-13).
export const packagingTypeSchema = z.strictObject({
  id: packagingTypeIdSchema,
  label: z.string().min(1).max(100),
});

// openapi.yaml `PurchaseDraftState` — the four lifecycle states (CONTEXT.md, AC-24a).
export const purchaseDraftStateSchema = z.enum([
  'draft',
  'ready_for_ordering',
  'closed',
  'discarded',
]);

// openapi.yaml `CustomerOrderState`, reused here so a link's `current.state` and `snapshot.capturedState`
// are typed identically to `customer-orders/customer-orders-projections.ts customerOrderStateSchema`.
export const linkedCustomerOrderLifecycleStateSchema = z.enum([
  'unfulfilled',
  'fulfilled',
  'cancelled',
]);

// openapi.yaml `DriftSignalKind` — what differs between a link's Demand Snapshot and the Customer
// Order it names now, derived on every read (AC-16).
export const driftSignalKindSchema = z.enum([
  'cancelled',
  'quantity_changed',
  'needed_by_moved',
  'became_fulfilled',
  // Address Drift (AC-18): the Customer Order this link names is going to a
  // different Delivery Address than the one captured at the freeze. Derived on
  // every read by comparing the two identifiers — never stored — so it stops
  // reporting the moment the order is redirected back.
  'delivery_address_changed',
]);

// openapi.yaml `DeliveryMode` — which of the two ways one line's goods travel, chosen **per line**,
// so one draft may hold lines of both modes (CONTEXT.md "Delivery Mode", AC-13).
export const deliveryModeSchema = z.enum([
  'via_warehouse',
  'direct_to_customer',
]);

// openapi.yaml `EndingKind` — the one kind of ending each Delivery Mode admits: goods that came Via
// Warehouse end in an `arrival` at the dock, goods sent Direct to Customer in a `direct_delivery`.
// The correspondence is `chk_purchase_draft_lines_ending_matches_mode`, and it is a **routing fact**
// on the write side rather than a submitted value (ADR 0002).
export const endingKindSchema = z.enum(['arrival', 'direct_delivery']);

// openapi.yaml `LineWarehouseDestination` — where a **Via Warehouse** line's goods travel: the
// Warehouse's own Delivery Address. The operator's own premises data, so it is readable by any
// member holding `PURCHASE_DRAFTS:WATCH` in that Warehouse and is **never** gated on
// `CUSTOMERS:WATCH` — a member who prepares the dock may hold no Workspace Role at all and no
// customer-read Permission either (AC-10, sad.md §7). It is therefore present on **both** forms of
// a line below, and this schema has no redacted counterpart at all.
//
// `addressText` is nullable only for the state AC-16a refuses to freeze from: a `draft`-state line
// whose Warehouse has recorded no address yet. `accessNotes` are `null` when none were recorded and
// never an empty string.
export const lineWarehouseDestinationSchema = z.strictObject({
  addressText: addressTextSchema.nullable(),
  accessNotes: accessNotesSchema,
  // `true` once these values were captured at Ready for Ordering. From that moment they are a
  // statement made at one moment rather than a reference, which is how AC-16 and AC-17 hold
  // structurally (`purchase_draft_lines.frozen_delivery_address_text`).
  frozen: z.boolean(),
});

// openapi.yaml `LineCustomerDestination` — where a **Direct to Customer** line's goods travel: a
// Customer's Delivery Address, with the customer name captured beside it at the freeze. Customer
// identity, and therefore **omitted entirely** from the redacted line (AC-09a).
export const lineCustomerDestinationSchema = z.strictObject({
  // The live reference. It stays populated on a frozen line — it is what the by-line read and the
  // ownership check use — but nothing reads it as the frozen statement (data-model.md
  // `purchase_draft_lines`).
  customerDeliveryAddressId: z.string().uuid(),
  customerId: z.string().uuid(),
  // Read live from the Customer record while the draft is in `draft`, and the name captured at
  // Ready for Ordering afterwards — captured together with the address text and the access notes,
  // so the whole frozen destination reads as one statement made at one moment.
  customerName: z.string().min(1),
  addressText: addressTextSchema,
  accessNotes: accessNotesSchema,
  frozen: z.boolean(),
});

// The captured values every actor may read: the demand exactly as it stood at the freeze, minus the
// Delivery Address it was going to. Stated once and spread into both forms below, so the two can
// never drift in a field that is not the redaction itself.
const demandSnapshotEntryCommonShape = {
  capturedQuantity: z.number().int().min(1),
  capturedNeededBy: z.string().date(),
  capturedState: customerOrderStateSchema,
};

// openapi.yaml `DemandSnapshotEntryIdentified` — captured once at the freeze, never updated, with
// the Delivery Address that Customer Order was going to at that instant captured beside the
// quantity, needed-by date and state (AC-16).
export const demandSnapshotEntryIdentifiedSchema = z
  .strictObject({
    ...demandSnapshotEntryCommonShape,
    // **The comparison key**, and the only thing Address Drift is decided on: drift is the identity
    // question "is this order going to a different Delivery Address than the one frozen for it".
    // Comparing the text instead would report drift when a member merely corrects a typo in an
    // address that was never redirected (CONTEXT.md "Address Drift").
    capturedDeliveryAddressId: z.string().uuid().nullable(),
    // **The frozen statement** — the address text as it read at the freeze, which is what AC-18
    // shows the member. The text is what is shown; the identifier is what decides whether there is
    // anything to show, so neither can be dropped without losing one of the two.
    capturedDeliveryAddressText: addressTextSchema.nullable(),
  })
  // `chk_purchase_draft_demand_snapshots_captured_address_pairing` as a contract rule: captured
  // together or not at all. Both are `null` — legitimately — for a link to a Customer Order
  // recorded by **typed name**, which names no address and stays linkable to a Via Warehouse line
  // exactly as before (AC-11a, AC-15b).
  .refine(
    (snapshot) =>
      (snapshot.capturedDeliveryAddressId === null) ===
      (snapshot.capturedDeliveryAddressText === null),
    {
      message:
        'A Demand Snapshot captures the Delivery Address identifier and its text together or not at all',
    },
  );

// openapi.yaml `DemandSnapshotEntryRedacted` — the captured demand without the captured Delivery
// Address. Strict, so a projection that nulled the two captured columns instead of omitting them
// fails validation on the way out (AC-09a).
export const demandSnapshotEntryRedactedSchema = z.strictObject(
  demandSnapshotEntryCommonShape,
);

// The linked order's current values every actor may read — the half of the drift comparison that
// carries no destination.
const linkedCustomerOrderStateCommonShape = {
  quantity: z.number().int().min(1),
  neededBy: z.string().date(),
  state: customerOrderStateSchema,
  outstandingQuantity: z.number().int().nonnegative(),
  // openapi.yaml `lastChangedAt` — when this Customer Order last moved, which is the half of the
  // comparison AC-16 asks for that the values alone cannot give: design frame `F0SpRx.png` dates
  // every drift statement (`Cancelled on 24 Aug`, `Raised to 1 000 on 25 Aug`). `null` for an order
  // that has not been changed since it was recorded — it has no such moment, and a projection that
  // reported its creation time instead would date a change that never happened.
  lastChangedAt: z.string().datetime().nullable(),
};

// openapi.yaml `LinkedCustomerOrderStateIdentified` — the linked Customer Order as it stands at the
// instant of this read, carrying the Delivery Address the demand **now** expects, which AC-18 shows
// beside the one frozen for it.
export const linkedCustomerOrderStateIdentifiedSchema = z.strictObject({
  ...linkedCustomerOrderStateCommonShape,
  // Compared against `snapshot.capturedDeliveryAddressId`; a disagreement raises
  // `delivery_address_changed` and is reflected on the very next read after a redirection — nothing
  // is stored and no job repairs anything (AC-18, AC-18a). `null` for an order recorded by typed
  // name.
  deliveryAddress: customerOrderDestinationSchema.nullable(),
});

// openapi.yaml `LinkedCustomerOrderStateRedacted` — the same current values without the
// destination (AC-09a).
export const linkedCustomerOrderStateRedactedSchema = z.strictObject(
  linkedCustomerOrderStateCommonShape,
);

// openapi.yaml `EndingAllocation` (`ordering`'s `ArrivalAllocation`) — what was assigned to this
// customer when the line ended. It carries no customer identity of its own, so it has one form.
export const arrivalAllocationSchema = z.strictObject({
  allocatedQuantity: z.number().int().min(1),
  allocatedByUserId: z.string().uuid(),
  createdAt: z.string().datetime(),
});

// What a link carries whatever the actor may read (AC-09a). `driftSignals` is here rather than in
// the identified half deliberately: **that** an address drift exists is a fact about the draft, not
// customer identity, and withholding it would tell an entitled member less than AC-18a promises.
const purchaseDraftLineLinkCommonShape = {
  id: z.string().uuid(),
  customerOrderId: z.string().uuid(),
  statedQuantity: z.number().int().min(1),
  driftSignals: z.array(driftSignalKindSchema),
  allocation: arrivalAllocationSchema.nullable(),
};

// openapi.yaml `PurchaseDraftLineLinkIdentified` — what the member intends of this line for one
// customer. It carries a stated quantity and **claims nothing** (AC-11a).
export const purchaseDraftLineLinkIdentifiedSchema = z
  .strictObject({
    ...purchaseDraftLineLinkCommonShape,
    // The Customer the linked order names, read live so correcting a Customer's name changes every
    // link that names it (AC-03b), or `null` for an order recorded by typed name.
    customer: customerRefSchema.nullable(),
    // The typed name when the linked order names no Customer; `null` otherwise.
    customerName: z.string().min(1).nullable(),
    snapshot: demandSnapshotEntryIdentifiedSchema.nullable(),
    current: linkedCustomerOrderStateIdentifiedSchema,
  })
  // `chk_customer_orders_customer_identity` read back through the link, and what makes the two
  // forms below **disjoint**: without it, a link carrying `customer: null, customerName: null` is a
  // valid identified link, so a projection that redacted by nulling the two instead of omitting
  // them would pass validation — and would then be one edit away from carrying the values.
  .refine((link) => (link.customer === null) !== (link.customerName === null), {
    message:
      'A linked Customer Order names either a Customer or a typed customer name, never both and never neither',
  });

// openapi.yaml `PurchaseDraftLineLinkRedacted` — the same link without customer identity.
// `customer`, `customerName` and both the captured and the current Delivery Address are **absent as
// properties** rather than null, and this object is strict, so their presence is a validation
// failure on the way out instead of a rendering artefact on a screen (AC-09a, sad.md §7, ADR 0001).
export const purchaseDraftLineLinkRedactedSchema = z.strictObject({
  ...purchaseDraftLineLinkCommonShape,
  snapshot: demandSnapshotEntryRedactedSchema.nullable(),
  current: linkedCustomerOrderStateRedactedSchema,
});

// openapi.yaml `PurchaseDraftLineLink` — `oneOf` the two forms above, ordered identified-first only
// for error quality. They are disjoint: the identified form **requires** both customer properties
// and the redacted form is strict and admits neither.
export const purchaseDraftLineLinkSchema = z.union([
  purchaseDraftLineLinkIdentifiedSchema,
  purchaseDraftLineLinkRedactedSchema,
]);

// What a line carries whatever the actor may read. `warehouseDestination` is deliberately part of
// it: the Warehouse's own address and access notes are the operator's premises data, read under
// `PURCHASE_DRAFTS:WATCH` alone and never withheld (AC-10, sad.md §7).
// openapi.yaml `PurchaseDraftLineEnding` — how one line ended, recorded **once** per line: the
// quantity, the kind, the acting member and the time, which
// `chk_purchase_draft_lines_ending_attribution` holds arrive together or not at all (AC-19, AC-20a).
//
// The quantity is deliberately unbounded above — what arrived, or what the customer said arrived, is
// bounded neither above nor below by what was ordered — and `0` is a real ending, recording that
// nothing came or nothing was delivered, rather than the absence of one.
export const purchaseDraftLineEndingSchema = z.strictObject({
  kind: endingKindSchema,
  quantity: z.number().int().nonnegative(),
  recordedByUserId: z.string().uuid(),
  recordedAt: z.string().datetime(),
});

const purchaseDraftLineCommonShape = {
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  itemSku: z.string().min(1),
  itemDescription: z.string().min(1),
  unitOfMeasure: unitOfMeasureSchema,
  orderedQuantity: z.number().int().min(1),
  packagingTypeId: packagingTypeIdSchema.nullable(),
  valueAddingNote: z.string().nullable(),
  // openapi.yaml `PurchaseDraftLineIdentified` — `receivedQuantity` is **superseded by
  // `ending.quantity`** (T17/ADR 0002). It is served for as long as the column exists, so a client
  // reading a draft that ended before the per-line endings landed still sees what arrived.
  receivedQuantity: z.number().int().nonnegative().nullable(),
  // openapi.yaml `PurchaseDraftLineEnding` — how this line ended, or `null` while it has no ending.
  // AC-19: the draft stays Ready for Ordering until every line of it carries one.
  ending: purchaseDraftLineEndingSchema.nullable(),
  // AC-13/AC-22 — how this line's own goods travel, which is what places it in one half of the
  // by-line read or the other.
  deliveryMode: deliveryModeSchema,
  // Present when `deliveryMode` is `via_warehouse`; `null` otherwise.
  warehouseDestination: lineWarehouseDestinationSchema.nullable(),
};

// openapi.yaml `PurchaseDraftLineIdentified` — one Item and quantity within the draft, carrying its
// own Pre-receipt Requirement, its own destination and its own links.
export const purchaseDraftLineIdentifiedSchema = z.strictObject({
  ...purchaseDraftLineCommonShape,
  // Present when `deliveryMode` is `direct_to_customer`; `null` otherwise. Exactly one of the two
  // destination properties is non-null, which is
  // `chk_purchase_draft_lines_delivery_mode_address` read back.
  customerDestination: lineCustomerDestinationSchema.nullable(),
  links: z.array(purchaseDraftLineLinkIdentifiedSchema),
});

// openapi.yaml `PurchaseDraftLineRedacted` — the same line read by an actor **without**
// `CUSTOMERS:WATCH`. `customerDestination` is absent as a property; `warehouseDestination` is not.
// `deliveryMode`, the quantities and the Pre-receipt Requirement are returned unchanged (AC-09a).
export const purchaseDraftLineRedactedSchema = z.strictObject({
  ...purchaseDraftLineCommonShape,
  links: z.array(purchaseDraftLineLinkRedactedSchema),
});

// openapi.yaml `PurchaseDraftLine` — `oneOf` the two forms. The redacted form omits
// `customerDestination` and serves the redacted links, while keeping `warehouseDestination`: the
// Warehouse's own premises data is not customer identity and is never withheld (AC-09a, AC-10).
export const purchaseDraftLineSchema = z.union([
  purchaseDraftLineIdentifiedSchema,
  purchaseDraftLineRedactedSchema,
]);

// openapi.yaml `PurchaseDraftSummary` — the list projection.
export const purchaseDraftSummarySchema = z.strictObject({
  id: z.string().uuid(),
  // openapi.yaml `reference` — the human name of the draft (`PD-0143`), minted by the database and
  // never absent, because every card, detail header and dialog title names the draft by it rather
  // than by its identifier (design frames `yGhkK.png`, `s5EPi.png`). Not pattern-checked: the
  // shape belongs to the sequence that generates it, and a later change of prefix or width must
  // not need a contract change.
  reference: z.string().min(1),
  state: purchaseDraftStateSchema,
  expectedArrivalDate: z.string().date().nullable(),
  lineCount: z.number().int().nonnegative(),
  // Whether any of this draft's Demand Snapshot rows differs in value from the Customer Order it
  // names now — and, since this feature, also raised by an address disagreement of **either**
  // Delivery Mode. Always `false` for a draft that was never frozen.
  hasDriftSignal: z.boolean(),
  // AC-18a — whether a **Direct to Customer** line of this draft is linked to a Customer Order now
  // going to a different Delivery Address than the one frozen for that link. A separate flag from
  // `hasDriftSignal` because AC-18a separates the two surfaces: drift on a directly-shipped line is
  // reported **on the list itself**, where the member sees it without opening anything, because
  // goods are travelling to an address nobody now expects them at; the same disagreement on a Via
  // Warehouse line is reported when the draft is opened, because everything on such a line lands at
  // one dock either way. Derived on this read, never stored.
  //
  // It is a boolean about the draft and not a count, a name or an address, so the summary still
  // carries no customer identity at all and has one form rather than two (openapi.yaml
  // `PurchaseDraftSummary`, spec.md §6.1 "Customer disclosure through a count").
  hasDirectToCustomerAddressDrift: z.boolean(),
  closureReason: z.string().nullable(),
  createdByUserId: z.string().uuid(),
  createdAt: z.string().datetime(),
  readiedByUserId: z.string().uuid().nullable(),
  readiedAt: z.string().datetime().nullable(),
  closedByUserId: z.string().uuid().nullable(),
  closedAt: z.string().datetime().nullable(),
  arrivalConfirmedByUserId: z.string().uuid().nullable(),
  arrivalConfirmedAt: z.string().datetime().nullable(),
  discardedByUserId: z.string().uuid().nullable(),
  discardedAt: z.string().datetime().nullable(),
});

// openapi.yaml `PurchaseDraftDetail` — the summary plus the draft's contents.
export const purchaseDraftDetailSchema = purchaseDraftSummarySchema.extend({
  lines: z.array(purchaseDraftLineSchema),
});

// openapi.yaml `PurchaseDraftLineListEntry` — one line of the by-line read, carrying the draft it
// belongs to so the view reads without a second request. Each line of a draft holding both modes
// appears in whichever half **its own** `deliveryMode` places it (AC-22).
export const purchaseDraftLineListEntrySchema = z.strictObject({
  purchaseDraftId: z.string().uuid(),
  purchaseDraftReference: z.string().min(1),
  purchaseDraftState: purchaseDraftStateSchema,
  expectedArrivalDate: z.string().date().nullable(),
  line: purchaseDraftLineSchema,
});

export type PackagingTypeId = z.infer<typeof packagingTypeIdSchema>;
export type PackagingType = z.infer<typeof packagingTypeSchema>;
export type PurchaseDraftState = z.infer<typeof purchaseDraftStateSchema>;
export type DriftSignalKind = z.infer<typeof driftSignalKindSchema>;
export type DeliveryMode = z.infer<typeof deliveryModeSchema>;
export type EndingKind = z.infer<typeof endingKindSchema>;
export type PurchaseDraftLineEnding = z.infer<
  typeof purchaseDraftLineEndingSchema
>;
export type LineWarehouseDestination = z.infer<
  typeof lineWarehouseDestinationSchema
>;
export type LineCustomerDestination = z.infer<
  typeof lineCustomerDestinationSchema
>;
export type DemandSnapshotEntryIdentified = z.infer<
  typeof demandSnapshotEntryIdentifiedSchema
>;
export type DemandSnapshotEntryRedacted = z.infer<
  typeof demandSnapshotEntryRedactedSchema
>;
export type LinkedCustomerOrderStateIdentified = z.infer<
  typeof linkedCustomerOrderStateIdentifiedSchema
>;
export type LinkedCustomerOrderStateRedacted = z.infer<
  typeof linkedCustomerOrderStateRedactedSchema
>;
export type ArrivalAllocation = z.infer<typeof arrivalAllocationSchema>;
export type PurchaseDraftLineLinkIdentified = z.infer<
  typeof purchaseDraftLineLinkIdentifiedSchema
>;
export type PurchaseDraftLineLinkRedacted = z.infer<
  typeof purchaseDraftLineLinkRedactedSchema
>;
export type PurchaseDraftLineLink = z.infer<typeof purchaseDraftLineLinkSchema>;
export type PurchaseDraftLineIdentified = z.infer<
  typeof purchaseDraftLineIdentifiedSchema
>;
export type PurchaseDraftLineRedacted = z.infer<
  typeof purchaseDraftLineRedactedSchema
>;
export type PurchaseDraftLine = z.infer<typeof purchaseDraftLineSchema>;
export type PurchaseDraftLineListEntry = z.infer<
  typeof purchaseDraftLineListEntrySchema
>;
export type PurchaseDraftSummary = z.infer<typeof purchaseDraftSummarySchema>;
export type PurchaseDraftDetail = z.infer<typeof purchaseDraftDetailSchema>;
