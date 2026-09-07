import { unitOfMeasureSchema } from 'items/items-projections';
import { z } from 'zod';

// openapi.yaml `AddressText` — where goods are sent, as **text a member types**. `TEXT NOT NULL`
// with a trimmed-non-empty check and **no upper bound**, so this schema states none either. Never
// validated, geocoded, normalized or interpreted (spec.md §3, CONTEXT.md "Delivery Address"). The
// trimmed-non-empty rule itself is decided by the server's value object, which is what lets the
// refusal name the field it will not accept without echoing the submitted text (AC-02, sad.md §8).
export const addressTextSchema = z.string().min(1);

// openapi.yaml `AccessNotes` — what a driver needs to get in. `null` when none was recorded, and
// never an empty string. Confidential data of the same classification as the Customer carrying
// them: never logged, never in an error detail, never in a denial payload (spec.md §6.1).
export const accessNotesSchema = z.string().min(1).nullable();

// openapi.yaml `CustomerDeliveryAddress` — a place one Customer's goods can be sent to. It carries
// no `warehouseId`: the Warehouse is the request's, never a field the caller reads back.
export const customerDeliveryAddressSchema = z.strictObject({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  addressText: addressTextSchema,
  accessNotes: accessNotesSchema,
  // At most one address per Customer carries `true`, and an Inactive one never does
  // (`chk_customer_delivery_addresses_main_is_active`).
  isMain: z.boolean(),
  // `null` = active. Set means the address is not offered where one is chosen, while every record
  // already naming it keeps reading and counting exactly as before (AC-06a).
  deactivatedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// openapi.yaml `Customer` — one named end customer within one Warehouse with the Delivery Addresses
// its goods may be sent to. Not shared across the Warehouses of a Workspace: the same name in two
// Warehouses names two unrelated Customers (AC-03a).
//
// This schema has **no redacted form**: every operation returning it already requires a
// `CUSTOMERS:*` Permission, so an actor who reaches it holds the Permission the identity is gated
// on (AC-09).
export const customerSchema = z.strictObject({
  id: z.string().uuid(),
  // Unique within the Warehouse across active and Inactive Customers alike, never across
  // Warehouses, and not released by deactivation (AC-03, AC-03a, AC-06).
  name: z.string().min(1),
  // `null` = active; a timestamp records the reversible withdrawal and when it happened (AC-06).
  deactivatedAt: z.string().datetime().nullable(),
  // The one **active** address a Customer Order takes when the member states none (AC-11). `null`
  // only for a Customer with no active address at all — a state no member action can reach, because
  // AC-07 refuses the deactivation that would produce it.
  mainDeliveryAddressId: z.string().uuid().nullable(),
  // Every address of this Customer, active and Inactive alike, ordered by creation time (AC-06a).
  deliveryAddresses: z.array(customerDeliveryAddressSchema),
  recordedByUserId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// openapi.yaml `CustomerOrderDestination` — where one Customer Order's goods are going, joined in
// from the Delivery Address it names. `isMain` and `deactivatedAt` are what the read reports about
// *why* it is this address (sad.md §6.6 step 6): the Customer's current Main one, one the member
// stated instead, or one that has since been made Inactive while the order keeps naming it and
// keeps counting exactly as before (AC-06a). Both are read live, never as they stood when the order
// was recorded.
export const customerOrderDestinationSchema = z.strictObject({
  deliveryAddressId: z.string().uuid(),
  addressText: addressTextSchema,
  accessNotes: accessNotesSchema,
  isMain: z.boolean(),
  deactivatedAt: z.string().datetime().nullable(),
});

// openapi.yaml `CustomerAwaitingOrder` — one Unfulfilled Customer Order of this Customer, with its
// Item, what is still owed, when it is needed and where it is going (AC-08).
export const customerAwaitingOrderSchema = z.strictObject({
  customerOrderId: z.string().uuid(),
  itemId: z.string().uuid(),
  itemSku: z.string().min(1),
  itemDescription: z.string().min(1),
  unitOfMeasure: unitOfMeasureSchema,
  // Every row here is Unfulfilled, so what is still owed is positive rather than merely
  // non-negative: a Fulfilled order is waiting for nothing and never appears (AC-08).
  outstandingQuantity: z.number().int().min(1),
  // `customer_orders.needed_by DATE` — a calendar date, never an instant.
  neededBy: z.string().date(),
  destination: customerOrderDestinationSchema,
});

// openapi.yaml `CustomerDetail` — the Customer plus everything they are still waiting for, the
// answer to their phone call without scrolling the demand list (US-04).
//
// openapi.yaml writes this flat rather than as `allOf` over `Customer`, because an `allOf`
// composition over a base closed with `additionalProperties: false` rejects the very property it
// adds under a strict JSON-Schema validator. That is a JSON-Schema artefact and not a modelling
// decision: Zod's `.extend` on a strict object produces exactly the closed object openapi.yaml
// spells out, with the same eight properties plus `awaitingCustomerOrders`, so the two agree while
// this side states each shared property once.
export const customerDetailSchema = customerSchema.extend({
  // Every **Unfulfilled** Customer Order of this Customer, earliest needed-by first; Fulfilled and
  // cancelled ones are omitted (AC-08).
  awaitingCustomerOrders: z.array(customerAwaitingOrderSchema),
});

export type CustomerDeliveryAddress = z.infer<
  typeof customerDeliveryAddressSchema
>;
export type Customer = z.infer<typeof customerSchema>;
export type CustomerOrderDestination = z.infer<
  typeof customerOrderDestinationSchema
>;
export type CustomerAwaitingOrder = z.infer<typeof customerAwaitingOrderSchema>;
export type CustomerDetail = z.infer<typeof customerDetailSchema>;
