import { customerOrderDestinationSchema } from 'customers/customers-projections';
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

// openapi.yaml `CustomerRef` — the Customer a Customer Order names, by identifier and **current**
// name. The name is read live from the Customer record rather than copied onto the order, which is
// what makes correcting a Customer's name change every order that names it without rewriting a row
// (AC-03b).
export const customerRefSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().min(1),
});

// The properties a Customer Order carries whatever the actor may read — everything
// `CUSTOMER_ORDERS:WATCH` alone entitles a member to (AC-09a). Stated once and spread into both
// forms below, so the two can never drift in a field that is not the redaction itself.
const customerOrderCommonShape = {
  id: z.string().uuid(),
  itemId: z.string().uuid(),
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
};

// openapi.yaml `CustomerOrderIdentified` — a named end customer waiting for a stated quantity of one
// Item by a stated date, carrying the Outstanding Quantity still owed to them and, since this
// feature, the customer's identity as a **reference** with the destination beside it (AC-01, AC-11,
// AC-19). It carries no `warehouseId`: the Warehouse is the request's, never a field the caller
// reads back.
//
// **Exactly one of `customer` and `customerName` is non-null**, never both and never neither, which
// `chk_customer_orders_customer_identity` holds as a schema fact rather than a convention. An order
// naming a Customer therefore carries `customerName: null` and reads the name live through
// `customer` (AC-03b, AC-11a); `destination` is `null` exactly when `customer` is, because a
// typed-name order names no address at all — and **that absence is what tells the member which kind
// of row they are looking at** (AC-24).
export const customerOrderIdentifiedSchema = z
  .strictObject({
    ...customerOrderCommonShape,
    customer: customerRefSchema.nullable(),
    customerName: z.string().min(1).nullable(),
    destination: customerOrderDestinationSchema.nullable(),
  })
  // `chk_customer_orders_customer_identity` as a contract rule rather than as prose beside one. It
  // is what makes the two forms of this projection **disjoint**: without it, an order carrying
  // `customer: null, customerName: null, destination: null` is a valid identified order, so a
  // projection that redacted by nulling the three fields instead of omitting them would pass
  // validation — and would then be one edit away from carrying the values instead of the nulls.
  // With it, that object matches neither branch and is refused (AC-09a, AC-11a).
  .refine(
    (order) => (order.customer === null) !== (order.customerName === null),
    {
      message:
        'A Customer Order names either a Customer or a typed customer name, never both and never neither',
    },
  )
  // AC-24 — a typed-name order names no address **at all**, and that absence is what tells the
  // member which kind of row they are looking at. An order naming a Customer always has one: the
  // reference is resolved at record time and the address row it names cannot disappear.
  .refine(
    (order) => (order.customer === null) === (order.destination === null),
    {
      message:
        'A Customer Order has a destination exactly when it names a Customer',
    },
  );

// openapi.yaml `CustomerOrderRedacted` — the same order read by an actor **without**
// `CUSTOMERS:WATCH`. `customer`, `customerName` and `destination` are **absent as properties**
// rather than null, and this object is strict, so their presence is a validation failure on the way
// out instead of a rendering artefact on a screen (AC-09a, sad.md §7, ADR 0001).
//
// No count is added here for the same reason none is withheld from the identified form: a count of
// Customers or addresses would answer "does this exist" as effectively as the record does
// (spec.md §6.1 "Customer disclosure through a count").
export const customerOrderRedactedSchema = z.strictObject(
  customerOrderCommonShape,
);

// openapi.yaml `CustomerOrder` — `oneOf` the two forms above. Both are modelled deliberately: the
// identified form is served to an actor holding the observed `CUSTOMERS:WATCH`, the redacted form to
// one who does not, and the choice is made by the resolved principal's observed Permissions, never
// by the surface (ADR 0001).
//
// The union is ordered identified-first only for error quality; the two are disjoint, because the
// identified form **requires** all three identity properties and the redacted form is strict and
// admits none of them. A half-redacted object — one that nulls a field instead of omitting it, or
// omits one of the three and keeps another — matches neither branch and fails validation.
export const customerOrderSchema = z.union([
  customerOrderIdentifiedSchema,
  customerOrderRedactedSchema,
]);

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
export type CustomerRef = z.infer<typeof customerRefSchema>;
export type CustomerOrderIdentified = z.infer<
  typeof customerOrderIdentifiedSchema
>;
export type CustomerOrderRedacted = z.infer<typeof customerOrderRedactedSchema>;
export type CustomerOrder = z.infer<typeof customerOrderSchema>;
export type DemandCoverage = z.infer<typeof demandCoverageSchema>;
export type DemandLine = z.infer<typeof demandLineSchema>;
