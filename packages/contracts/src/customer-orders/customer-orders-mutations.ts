import { customerOrderStateSchema } from 'customer-orders/customer-orders-projections';
import { z } from 'zod';

// Every request schema below is a `strictObject`, which is what makes the derived values of this
// subpath unsubmittable: openapi.yaml `info` records that Demand Lines, Coverage and Drift Signals
// are derived on every read, and `DemandLine` is "never a stored record and never an input to any
// endpoint". A strict object refuses such a field outright rather than silently discarding it, so a
// caller that believes it is setting Coverage or an Outstanding Quantity is told it is not.

// openapi.yaml `CustomerOrderCreate` — the values a member records, in the two mutually exclusive
// shapes `chk_customer_orders_customer_identity` admits: **a Customer** of this Warehouse,
// optionally with one of its Delivery Addresses, **or a typed customer name** with neither — never
// both and never neither (AC-11, AC-11a). Neither the state nor the Outstanding Quantity is an
// input: the order is written Unfulfilled with its Outstanding Quantity equal to the quantity
// recorded (AC-01, AC-02).
//
// openapi.yaml models this as `oneOf` two closed objects; here it is one strict object with the
// identity properties optional and the exclusivity enforced by a refinement, which admits and
// refuses exactly the same payloads. The reason is `createZodDto` from `nestjs-zod`, the mechanism
// ADR 12-07-2026 fixes for server request validation: it derives a DTO **class** and so requires a
// schema with statically known members, which a `z.union` does not have. The refinement is the same
// technique `customerOrderAmendSchema` below already uses for `minProperties: 1`.
export const customerOrderCreateSchema = z
  .strictObject({
    itemId: z.string().uuid(),
    // An **active** Customer of this Warehouse. One of another Warehouse is refused identically to
    // one that does not exist, and the refusal discloses nothing about what exists elsewhere
    // (AC-12) — a rule the server decides, never this schema.
    customerId: z.string().uuid().optional(),
    // An **active** Delivery Address **of the Customer named above**; omitted takes the Customer's
    // current Main one, resolved and stored as a reference at record time (AC-11).
    customerDeliveryAddressId: z.string().uuid().optional(),
    // The name typed onto an order that names no Customer. **No Customer is created and none is
    // matched** for it, then or ever, and it carries no Delivery Address (AC-11a, AC-24).
    customerName: z.string().min(1).optional(),
    quantity: z.number().int().min(1),
    // Must not have already passed — the rule itself is decided by the server against its own clock
    // (AC-02a), so the schema fixes only the calendar-date shape.
    neededBy: z.string().date(),
  })
  .refine(
    (value) =>
      (value.customerId === undefined) !== (value.customerName === undefined),
    {
      message:
        'A Customer Order names either a Customer or a typed customer name, never both and never neither',
    },
  )
  .refine(
    (value) =>
      value.customerDeliveryAddressId === undefined ||
      value.customerId !== undefined,
    {
      message:
        'A Delivery Address is stated only for an order naming a Customer',
    },
  );

// openapi.yaml `CustomerOrderRedirect` — which of the **same Customer's active** Delivery Addresses
// this outstanding order is now going to. The Customer is not an input and never changes: serving a
// different customer means recording a new Customer Order (AC-11c).
export const customerOrderRedirectSchema = z.strictObject({
  customerDeliveryAddressId: z.string().uuid(),
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
export type CustomerOrderRedirect = z.infer<typeof customerOrderRedirectSchema>;
export type CustomerOrderAmend = z.infer<typeof customerOrderAmendSchema>;
export type CustomerOrderCancellation = z.infer<
  typeof customerOrderCancellationSchema
>;
export type CustomerOrderListQuery = z.infer<
  typeof customerOrderListQuerySchema
>;
