import { customerOrderStateSchema } from 'customer-orders/customer-orders-projections';
import { z } from 'zod';

// Every request schema below is a `strictObject`, which is what makes the derived values of this
// subpath unsubmittable: openapi.yaml `info` records that Demand Lines, Coverage and Drift Signals
// are derived on every read, and `DemandLine` is "never a stored record and never an input to any
// endpoint". A strict object refuses such a field outright rather than silently discarding it, so a
// caller that believes it is setting Coverage or an Outstanding Quantity is told it is not.

// openapi.yaml `CustomerOrderCreate` — the four values a member records. Neither the state nor the
// Outstanding Quantity is an input: the order is written Unfulfilled with its Outstanding Quantity
// equal to the quantity recorded (AC-01, AC-02).
export const customerOrderCreateSchema = z.strictObject({
  itemId: z.string().uuid(),
  customerName: z.string().min(1),
  quantity: z.number().int().min(1),
  // Must not have already passed — the rule itself is decided by the server against its own clock
  // (AC-02a), so the schema fixes only the calendar-date shape.
  neededBy: z.string().date(),
});

// openapi.yaml `CustomerOrderAmend` — `minProperties: 1` with both properties optional. The
// Outstanding Quantity is recalculated rather than submitted, and a Fulfilled order whose quantity
// was raised returns to Unfulfilled (AC-19).
export const customerOrderAmendSchema = z
  .strictObject({
    quantity: z.number().int().min(1).optional(),
    neededBy: z.string().date().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one Customer Order field must be present',
  });

// openapi.yaml `CustomerOrderCancellation` — the reason is never optional; it arrives with the
// acting member and the time or not at all (AC-19a).
export const customerOrderCancellationSchema = z.strictObject({
  cancellationReason: z.string().min(1),
});

// `GET .../customer-orders` query parameters (openapi.yaml `listCustomerOrders`) — `itemId`
// narrows to the orders behind one Demand Line and `state` to one lifecycle state; omitting both
// returns every state. Neither is coerced: both arrive as strings already.
export const customerOrderListQuerySchema = z.strictObject({
  itemId: z.string().uuid().optional(),
  state: customerOrderStateSchema.optional(),
});

export type CustomerOrderCreate = z.infer<typeof customerOrderCreateSchema>;
export type CustomerOrderAmend = z.infer<typeof customerOrderAmendSchema>;
export type CustomerOrderCancellation = z.infer<
  typeof customerOrderCancellationSchema
>;
export type CustomerOrderListQuery = z.infer<
  typeof customerOrderListQuerySchema
>;
