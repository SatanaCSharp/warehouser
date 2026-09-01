import { unitOfMeasureSchema } from 'items/items-projections';
import { z } from 'zod';

// openapi.yaml `CustomerOrderState` — the three states demand can be in. `unfulfilled` is the
// single word this feature uses for demand that still counts; `fulfilled` left the consolidated
// demand through Allocation; `cancelled` ended because the customer no longer wants the goods
// (CONTEXT.md).
export const customerOrderStateSchema = z.enum([
  'unfulfilled',
  'fulfilled',
  'cancelled',
]);

// openapi.yaml `CustomerOrder` — a named end customer waiting for a stated quantity of one Item by
// a stated date, carrying the Outstanding Quantity still owed to them (AC-01, AC-19, AC-19a). It
// carries no `warehouseId`: the Warehouse is the request's, never a field the caller reads back.
export const customerOrderSchema = z.strictObject({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  customerName: z.string().min(1),
  quantity: z.number().int().min(1),
  outstandingQuantity: z.number().int().nonnegative(),
  // `customer_orders.needed_by DATE` — a calendar date, never an instant.
  neededBy: z.string().date(),
  state: customerOrderStateSchema,
  cancellationReason: z.string().nullable(),
  recordedByUserId: z.string().uuid(),
  cancelledByUserId: z.string().uuid().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// openapi.yaml `DemandCoverage` — one entry per Purchase Draft line link, never aggregated per
// draft. Only open draft states appear: a Closed or Discarded draft presents as Coverage no longer
// (AC-21a, AC-24).
export const demandCoverageSchema = z.strictObject({
  purchaseDraftId: z.string().uuid(),
  // AC-20 — "which Purchase Drafts link to it and for what quantity": the `COVERED BY` chip reads
  // `PD-0142 · 800`, so the human reference the member knows the draft by travels with the stated
  // quantity. An id alone answers "for what quantity" but not "which drafts" (design frame
  // `G6jhw.png`).
  purchaseDraftReference: z.string().min(1),
  purchaseDraftLineId: z.string().uuid(),
  purchaseDraftState: z.enum(['draft', 'ready_for_ordering']),
  statedQuantity: z.number().int().min(1),
});

// openapi.yaml `DemandLine` — one Item's consolidated Unfulfilled demand, a **derived view** that
// is never a stored record and never an input to any endpoint (CONTEXT.md §Invariants, sad.md §7).
// An Item with no Unfulfilled demand produces no Demand Line at all, which is why both the total
// and the count are positive rather than merely non-negative (AC-04, AC-17a).
export const demandLineSchema = z.strictObject({
  itemId: z.string().uuid(),
  sku: z.string().min(1),
  description: z.string().min(1),
  unitOfMeasure: unitOfMeasureSchema,
  totalOutstandingQuantity: z.number().int().min(1),
  earliestNeededBy: z.string().date(),
  onHandQuantity: z.number().int().nonnegative(),
  unfulfilledCustomerOrderCount: z.number().int().min(1),
  coverage: z.array(demandCoverageSchema),
});

export type CustomerOrderState = z.infer<typeof customerOrderStateSchema>;
export type CustomerOrder = z.infer<typeof customerOrderSchema>;
export type DemandCoverage = z.infer<typeof demandCoverageSchema>;
export type DemandLine = z.infer<typeof demandLineSchema>;
