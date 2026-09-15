import {
  customerAwaitingOrderSchema,
  customerCreateSchema,
  customerDeliveryAddressCreateSchema,
  customerDeliveryAddressSchema,
  customerDeliveryAddressUpdateSchema,
  customerDetailSchema,
  customerListQuerySchema,
  customerSchema,
  customerUpdateSchema,
} from 'customers';
import { describe, expect, it } from 'vitest';

// T10 — the shared `customers` contract subpath (contracts/openapi.yaml `Customer`,
// `CustomerDeliveryAddress`, `CustomerDetail`, `CustomerAwaitingOrder`, `CustomerCreate`,
// `CustomerUpdate`, `CustomerDeliveryAddressCreate`, `CustomerDeliveryAddressUpdate`). Mirrors
// `customer-orders-contracts.spec.ts`: schemas are imported through the module barrel by its bare
// specifier and exercised as behaviour — what they accept and what they refuse — never by
// inspecting their internals.
//
// The load-bearing statement of this file is the last describe block: activation, attribution and
// the Main flag are **recorded by the server**, so no request schema in the subpath accepts one
// (AC-01).

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const validDeliveryAddress = {
  id: id(301),
  customerId: id(201),
  addressText: 'Test Address 1, Test City',
  accessNotes: 'Gate code on the intercom; deliveries 09:00-17:00',
  isMain: true,
  deactivatedAt: null,
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
};

const validCustomer = {
  id: id(201),
  name: 'Test Customer North',
  deactivatedAt: null,
  mainDeliveryAddressId: id(301),
  deliveryAddresses: [validDeliveryAddress],
  recordedByUserId: id(1),
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
};

const validAwaitingOrder = {
  customerOrderId: id(601),
  itemId: id(101),
  itemSku: 'TEST-SKU-0001',
  itemDescription: 'Test Item - 2 m cable',
  unitOfMeasure: 'metres',
  outstandingQuantity: 40,
  neededBy: '2026-09-20',
  destination: {
    deliveryAddressId: id(301),
    addressText: 'Test Address 1, Test City',
    accessNotes: 'Gate code on the intercom; deliveries 09:00-17:00',
    isMain: true,
    deactivatedAt: null,
  },
};

describe('customer projections', () => {
  it('accepts the Customer openapi.yaml documents', () => {
    expect(customerSchema.parse(validCustomer)).toEqual(validCustomer);
  });

  // AC-06 — a Customer withdrawn reversibly at a known time, whose addresses are left in the state
  // they were already in.
  it('accepts an Inactive Customer', () => {
    expect(
      customerSchema.safeParse({
        ...validCustomer,
        deactivatedAt: '2026-09-02T12:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  // openapi.yaml `Customer.mainDeliveryAddressId` — `null` only for a Customer with no active
  // address at all, which the model does not forbid as a row constraint even though AC-07 keeps no
  // member action able to reach it.
  it('accepts a Customer with no Main Delivery Address', () => {
    expect(
      customerSchema.safeParse({
        ...validCustomer,
        mainDeliveryAddressId: null,
      }).success,
    ).toBe(true);
  });

  it('refuses a Customer carrying a property openapi.yaml closes it against', () => {
    expect(
      customerSchema.safeParse({ ...validCustomer, warehouseId: id(701) })
        .success,
    ).toBe(false);
  });

  // The Warehouse is the request's, never a field the caller reads back — the same reason
  // `CustomerOrder` carries none.
  it('refuses a Delivery Address carrying a warehouseId', () => {
    expect(
      customerDeliveryAddressSchema.safeParse({
        ...validDeliveryAddress,
        warehouseId: id(701),
      }).success,
    ).toBe(false);
  });

  // openapi.yaml `AccessNotes` — `null` when none was recorded; **never** an empty string.
  it('accepts absent access notes and refuses empty ones', () => {
    expect(
      customerDeliveryAddressSchema.safeParse({
        ...validDeliveryAddress,
        accessNotes: null,
      }).success,
    ).toBe(true);
    expect(
      customerDeliveryAddressSchema.safeParse({
        ...validDeliveryAddress,
        accessNotes: '',
      }).success,
    ).toBe(false);
  });

  // openapi.yaml `AddressText` — `minLength: 1` and **no upper bound**, because the column has none.
  it('refuses an empty address text and accepts a very long one', () => {
    expect(
      customerDeliveryAddressSchema.safeParse({
        ...validDeliveryAddress,
        addressText: '',
      }).success,
    ).toBe(false);
    expect(
      customerDeliveryAddressSchema.safeParse({
        ...validDeliveryAddress,
        addressText: 'a'.repeat(5_000),
      }).success,
    ).toBe(true);
  });
});

describe('customer detail', () => {
  it('accepts the Customer plus everything it is waiting for (AC-08)', () => {
    const detail = {
      ...validCustomer,
      awaitingCustomerOrders: [validAwaitingOrder],
    };

    expect(customerDetailSchema.parse(detail)).toEqual(detail);
  });

  // The `allOf`-over-a-closed-base problem openapi.yaml records is a JSON-Schema artefact; the
  // composed Zod object is closed exactly as the flat one is.
  it('stays closed against a property the Customer does not carry', () => {
    expect(
      customerDetailSchema.safeParse({
        ...validCustomer,
        awaitingCustomerOrders: [],
        activeDeliveryAddressCount: 1,
      }).success,
    ).toBe(false);
  });

  // AC-08 — every row here is Unfulfilled, so what is still owed is positive: a Fulfilled order is
  // waiting for nothing and never appears.
  it('refuses an awaiting order owing nothing', () => {
    expect(
      customerAwaitingOrderSchema.safeParse({
        ...validAwaitingOrder,
        outstandingQuantity: 0,
      }).success,
    ).toBe(false);
  });

  // AC-06a — the order keeps naming an address that has since been made Inactive and keeps counting
  // exactly as before, which is what `destination.deactivatedAt` reports.
  it('accepts a destination that has since been made Inactive', () => {
    expect(
      customerAwaitingOrderSchema.safeParse({
        ...validAwaitingOrder,
        destination: {
          ...validAwaitingOrder.destination,
          isMain: false,
          deactivatedAt: '2026-09-02T12:30:00.000Z',
        },
      }).success,
    ).toBe(true);
  });

  // `customer_orders.needed_by DATE` — a calendar date, never an instant.
  it('refuses a needed-by instant where a calendar date belongs', () => {
    expect(
      customerAwaitingOrderSchema.safeParse({
        ...validAwaitingOrder,
        neededBy: '2026-09-20T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('customer requests', () => {
  // AC-01 — a Customer is recorded with its first Delivery Address in one transaction, never bare.
  it('requires the first Delivery Address alongside the name', () => {
    expect(
      customerCreateSchema.parse({
        name: 'Test Customer North',
        deliveryAddress: { addressText: 'Test Address 1, Test City' },
      }),
    ).toEqual({
      name: 'Test Customer North',
      deliveryAddress: {
        addressText: 'Test Address 1, Test City',
        accessNotes: null,
      },
    });
    expect(
      customerCreateSchema.safeParse({ name: 'Test Customer North' }).success,
    ).toBe(false);
  });

  // AC-03b — activation is its own sub-resource and the addresses are their own collection, so
  // neither is amendable through the name correction.
  it('accepts the name only when a Customer is corrected', () => {
    expect(
      customerUpdateSchema.parse({ name: 'Test Customer North (Ltd)' }),
    ).toEqual({ name: 'Test Customer North (Ltd)' });
    expect(
      customerUpdateSchema.safeParse({
        name: 'Test Customer North (Ltd)',
        deactivatedAt: null,
      }).success,
    ).toBe(false);
  });

  // AC-04/AC-05 — an address arrives ordinary unless the member says otherwise, which is the
  // contract's own `default: false`.
  it('defaults a new Delivery Address to ordinary and to no access notes', () => {
    expect(
      customerDeliveryAddressCreateSchema.parse({
        addressText: 'Test Address 2, Test Town',
      }),
    ).toEqual({
      addressText: 'Test Address 2, Test Town',
      accessNotes: null,
      main: false,
    });
  });

  // openapi.yaml `CustomerDeliveryAddressUpdate` — `minProperties: 1`; `accessNotes: null` clears
  // them, and that is deliberately distinct from omitting the property.
  it('requires at least one property and keeps a cleared note distinct from an omitted one', () => {
    expect(customerDeliveryAddressUpdateSchema.safeParse({}).success).toBe(
      false,
    );
    expect(
      customerDeliveryAddressUpdateSchema.parse({ accessNotes: null }),
    ).toEqual({ accessNotes: null });
    expect(
      customerDeliveryAddressUpdateSchema.parse({
        addressText: 'Test Address 2, Test Town, Unit 4',
      }),
    ).toEqual({ addressText: 'Test Address 2, Test Town, Unit 4' });
  });

  // Query parameters arrive as strings, and `z.coerce.boolean()` would read `"false"` as `true` —
  // which would silently turn the unfiltered list into the picker read.
  it('reads the active filter from the literal true and false', () => {
    expect(customerListQuerySchema.parse({})).toEqual({});
    expect(customerListQuerySchema.parse({ active: 'true' })).toEqual({
      active: true,
    });
    expect(customerListQuerySchema.parse({ active: 'false' })).toEqual({
      active: false,
    });
    expect(customerListQuerySchema.safeParse({ active: 'yes' }).success).toBe(
      false,
    );
  });
});

// AC-01 — "activation and attribution are not inputs: the Customer is recorded active, its address
// active and Main, with the recording member and the time". A strict object refuses such a field
// outright rather than silently discarding it, so a caller that believes it is setting one is told
// it is not.
describe('server-recorded values are unsubmittable', () => {
  it.each([
    ['id', id(201)],
    ['deactivatedAt', null],
    ['recordedByUserId', id(1)],
    ['mainDeliveryAddressId', id(301)],
    ['createdAt', '2026-09-01T08:00:00.000Z'],
  ])('refuses %s on a Customer submission', (property, value) => {
    expect(
      customerCreateSchema.safeParse({
        name: 'Test Customer North',
        deliveryAddress: { addressText: 'Test Address 1, Test City' },
        [property]: value,
      }).success,
    ).toBe(false);
  });

  it.each([
    ['id', id(301)],
    ['customerId', id(201)],
    // `isMain` is not an input here: marking an address Main is its own sub-resource, so the
    // decision declares its Permission through a path rather than through a payload value.
    ['isMain', true],
    ['deactivatedAt', null],
  ])('refuses %s on a Delivery Address submission', (property, value) => {
    expect(
      customerDeliveryAddressCreateSchema.safeParse({
        addressText: 'Test Address 2, Test Town',
        [property]: value,
      }).success,
    ).toBe(false);
    expect(
      customerDeliveryAddressUpdateSchema.safeParse({
        addressText: 'Test Address 2, Test Town',
        [property]: value,
      }).success,
    ).toBe(false);
  });
});
