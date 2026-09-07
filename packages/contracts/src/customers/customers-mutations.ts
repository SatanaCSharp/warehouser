import {
  accessNotesSchema,
  addressTextSchema,
} from 'customers/customers-projections';
import { z } from 'zod';

// Every request schema below is a `strictObject`, which is what makes this subpath's derived and
// attributed values unsubmittable: activation, the recording member, the time and the Main flag are
// recorded by the server (AC-01), and a strict object refuses such a field outright rather than
// silently discarding it, so a caller that believes it is setting one is told it is not.

// openapi.yaml `CustomerDeliveryAddressWrite` — the address text and its access notes, the shape
// shared by a Customer's first address and every one added afterwards. `accessNotes` is optional on
// the wire and `null` when none was recorded, so the default makes the two spellings one value the
// server never has to distinguish.
export const customerDeliveryAddressWriteSchema = z.strictObject({
  addressText: addressTextSchema,
  accessNotes: accessNotesSchema.default(null),
});

// openapi.yaml `CustomerCreate` — a Customer is recorded **with its first Delivery Address in one
// transaction**, never bare: a Customer always keeps at least one active Delivery Address, and
// creating it without one would be the very state AC-07 refuses to produce (AC-01).
export const customerCreateSchema = z.strictObject({
  name: z.string().min(1),
  deliveryAddress: customerDeliveryAddressWriteSchema,
});

// openapi.yaml `CustomerUpdate` — the name only. Activation is its own sub-resource and the Delivery
// Addresses are their own collection, so neither is amendable here (AC-03b).
export const customerUpdateSchema = z.strictObject({
  name: z.string().min(1),
});

// openapi.yaml `CustomerDeliveryAddressCreate` — a new Delivery Address for an existing Customer,
// recorded active. `main: true` makes it the Customer's Main address and clears the previous Main
// flag **in the same transaction**, so exactly one active address is Main at every instant
// (AC-04, AC-05); the contract's own `default: false` is what makes an address arrive ordinary
// unless the member says otherwise.
export const customerDeliveryAddressCreateSchema = z.strictObject({
  addressText: addressTextSchema,
  accessNotes: accessNotesSchema.default(null),
  main: z.boolean().default(false),
});

// openapi.yaml `CustomerDeliveryAddressUpdate` — `minProperties: 1` with both properties optional.
// `accessNotes: null` clears them, so `undefined` ("not submitted", keep what is stored) and `null`
// ("clear these") stay deliberately distinguishable. `isMain` is absent: it is its own sub-resource,
// so marking an address Main declares the same Permission through a path rather than through a
// payload value.
export const customerDeliveryAddressUpdateSchema = z
  .strictObject({
    addressText: addressTextSchema.optional(),
    accessNotes: accessNotesSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one Delivery Address field must be present',
  });

// `GET .../customers` `active` query parameter (openapi.yaml `listCustomers`) — `true` narrows to
// Customers that are not Inactive, the picker read used while recording demand (AC-06); omitted
// returns active and Inactive alike, because a Customer Order already naming an Inactive Customer
// stays readable and keeps counting exactly as before. Query parameters arrive as strings, so
// `active` is read from the literal `"true"`/`"false"` rather than `z.coerce.boolean()`, which
// treats every non-empty string — `"false"` included — as `true`.
export const customerListQuerySchema = z.strictObject({
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

export type CustomerDeliveryAddressWrite = z.infer<
  typeof customerDeliveryAddressWriteSchema
>;
export type CustomerCreate = z.infer<typeof customerCreateSchema>;
export type CustomerUpdate = z.infer<typeof customerUpdateSchema>;
export type CustomerDeliveryAddressCreate = z.infer<
  typeof customerDeliveryAddressCreateSchema
>;
export type CustomerDeliveryAddressUpdate = z.infer<
  typeof customerDeliveryAddressUpdateSchema
>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
