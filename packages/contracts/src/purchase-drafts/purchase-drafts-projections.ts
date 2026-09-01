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
]);

// openapi.yaml `DemandSnapshotEntry` — captured once at the freeze, never updated (AC-16).
export const demandSnapshotEntrySchema = z.strictObject({
  capturedQuantity: z.number().int().min(1),
  capturedNeededBy: z.string().date(),
  capturedState: linkedCustomerOrderLifecycleStateSchema,
});

// openapi.yaml `LinkedCustomerOrderState` — the other half of the drift comparison, read fresh.
export const linkedCustomerOrderStateSchema = z.strictObject({
  quantity: z.number().int().min(1),
  neededBy: z.string().date(),
  state: linkedCustomerOrderLifecycleStateSchema,
  outstandingQuantity: z.number().int().nonnegative(),
  // openapi.yaml `lastChangedAt` — when this Customer Order last moved, which is the half of the
  // comparison AC-16 asks for that the values alone cannot give: design frame `F0SpRx.png` dates
  // every drift statement (`Cancelled on 24 Aug`, `Raised to 1 000 on 25 Aug`). Generic rather than
  // cancellation-specific, because the frame dates an amendment the same way it dates a
  // cancellation, and one field covers both. `null` for an order that has not been changed since it
  // was recorded — it has no such moment, and a projection that reported its creation time instead
  // would date a change that never happened.
  lastChangedAt: z.string().datetime().nullable(),
});

// openapi.yaml `ArrivalAllocation` — what was assigned to this customer at Arrival Confirmation.
export const arrivalAllocationSchema = z.strictObject({
  allocatedQuantity: z.number().int().min(1),
  allocatedByUserId: z.string().uuid(),
  createdAt: z.string().datetime(),
});

// openapi.yaml `PurchaseDraftLineLink` — what the member intends of a line for one customer; it
// claims nothing (AC-11a).
export const purchaseDraftLineLinkSchema = z.strictObject({
  id: z.string().uuid(),
  customerOrderId: z.string().uuid(),
  customerName: z.string().min(1),
  statedQuantity: z.number().int().min(1),
  snapshot: demandSnapshotEntrySchema.nullable(),
  current: linkedCustomerOrderStateSchema,
  driftSignals: z.array(driftSignalKindSchema),
  allocation: arrivalAllocationSchema.nullable(),
});

// openapi.yaml `PurchaseDraftLine` — one Item and quantity within the draft, carrying its own
// Pre-receipt Requirement and its own links.
export const purchaseDraftLineSchema = z.strictObject({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  itemSku: z.string().min(1),
  itemDescription: z.string().min(1),
  unitOfMeasure: unitOfMeasureSchema,
  orderedQuantity: z.number().int().min(1),
  packagingTypeId: packagingTypeIdSchema.nullable(),
  valueAddingNote: z.string().nullable(),
  receivedQuantity: z.number().int().nonnegative().nullable(),
  links: z.array(purchaseDraftLineLinkSchema),
});

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
  hasDriftSignal: z.boolean(),
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

export type PackagingTypeId = z.infer<typeof packagingTypeIdSchema>;
export type PackagingType = z.infer<typeof packagingTypeSchema>;
export type PurchaseDraftState = z.infer<typeof purchaseDraftStateSchema>;
export type DriftSignalKind = z.infer<typeof driftSignalKindSchema>;
export type DemandSnapshotEntry = z.infer<typeof demandSnapshotEntrySchema>;
export type LinkedCustomerOrderState = z.infer<
  typeof linkedCustomerOrderStateSchema
>;
export type ArrivalAllocation = z.infer<typeof arrivalAllocationSchema>;
export type PurchaseDraftLineLink = z.infer<typeof purchaseDraftLineLinkSchema>;
export type PurchaseDraftLine = z.infer<typeof purchaseDraftLineSchema>;
export type PurchaseDraftSummary = z.infer<typeof purchaseDraftSummarySchema>;
export type PurchaseDraftDetail = z.infer<typeof purchaseDraftDetailSchema>;
