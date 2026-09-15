import { purchaseDraftLineSchema } from '@warehouser/contracts/purchase-drafts';
import type {
  PurchaseDraftLineIdentifiedWithDrift,
  PurchaseDraftLineLinkIdentifiedWithDrift,
} from 'purchase-drafts/domain/projections/purchase-draft-projection';
import { toLineResponse } from 'purchase-drafts/rest/mappers/purchase-draft-response.mapper';
import { describe, expect, it } from 'vitest';

// `purchase-draft-response-contract-parity.spec.ts` drives this mapper through the two read queries,
// but every fixture it builds carries `links: []` — so the link projection, which is where the
// identified read differs from the redacted one, was never mapped by any test. It is the projection
// that decides whether a member with `CUSTOMERS:WATCH` sees the address a linked order was frozen
// against beside the one it expects now (AC-18), and both of its shapes are optional, so both are
// pinned here.
//
// The subject is `toLineResponse` rather than the link mapper itself: the link mappers are not
// exported, and which of the two is reached is `identifiesCustomer`'s decision — `'customerDestination'
// in line` — which is part of the behaviour worth holding.

const customerOrderId = '00000000-0000-4000-8000-000000000801';

const identifiedLink = (
  overrides: Partial<PurchaseDraftLineLinkIdentifiedWithDrift> = {},
): PurchaseDraftLineLinkIdentifiedWithDrift => ({
  id: '00000000-0000-4000-8000-000000000901',
  customerOrderId,
  statedQuantity: 40,
  addressDrift: false,
  allocation: null,
  driftSignals: [],
  customer: { id: '00000000-0000-4000-8000-000000000a01', name: 'Northwind' },
  customerName: null,
  snapshot: {
    capturedQuantity: 40,
    capturedNeededBy: '2026-09-20',
    capturedState: 'unfulfilled',
    capturedDeliveryAddressId: '00000000-0000-4000-8000-000000000b01',
    capturedDeliveryAddressText: 'Dock 4, Old Street',
  },
  current: {
    quantity: 40,
    neededBy: '2026-09-20',
    state: 'unfulfilled',
    outstandingQuantity: 40,
    lastChangedAt: '2026-09-02T09:00:00.000Z',
    deliveryAddress: {
      deliveryAddressId: '00000000-0000-4000-8000-000000000b02',
      addressText: 'Dock 9, New Street',
      accessNotes: 'Ring the bell',
      isMain: true,
      deactivatedAt: null,
    },
  },
  ...overrides,
});

const identifiedLineWith = (
  links: readonly PurchaseDraftLineLinkIdentifiedWithDrift[],
): PurchaseDraftLineIdentifiedWithDrift => ({
  id: '00000000-0000-4000-8000-000000000601',
  itemId: '00000000-0000-4000-8000-000000000701',
  itemSku: 'WH-100420',
  itemDescription: 'Pallet wrap, 500mm',
  unitOfMeasure: 'each',
  orderedQuantity: 100,
  packagingTypeId: null,
  valueAddingNote: null,
  ending: null,
  deliveryMode: 'direct_to_customer',
  warehouseDestination: null,
  // The discriminator `identifiesCustomer` reads. Its presence is what routes the line — and its
  // links — through the identified mapper rather than the redacted one.
  customerDestination: {
    customerDeliveryAddressId: '00000000-0000-4000-8000-000000000b02',
    customerId: '00000000-0000-4000-8000-000000000a01',
    customerName: 'Northwind',
    addressText: 'Dock 9, New Street',
    accessNotes: null,
    frozen: true,
  },
  links,
});

describe('toLineResponse on an identified line', () => {
  it('projects both sides of the address comparison a drifted link carries', () => {
    const response = toLineResponse(
      identifiedLineWith([
        identifiedLink({
          addressDrift: true,
          driftSignals: ['delivery_address_changed'],
        }),
      ]),
    );

    expect(response).toMatchObject({
      links: [
        {
          customer: { id: expect.any(String), name: 'Northwind' },
          customerName: null,
          driftSignals: ['delivery_address_changed'],
          snapshot: {
            capturedDeliveryAddressId: '00000000-0000-4000-8000-000000000b01',
            capturedDeliveryAddressText: 'Dock 4, Old Street',
          },
          current: {
            deliveryAddress: {
              deliveryAddressId: '00000000-0000-4000-8000-000000000b02',
              addressText: 'Dock 9, New Street',
              accessNotes: 'Ring the bell',
              isMain: true,
              deactivatedAt: null,
            },
          },
        },
      ],
    });
    // The response the web parses is the contract's, so the projection is proved against the schema
    // rather than only against itself.
    expect(purchaseDraftLineSchema.safeParse(response).success).toBe(true);
  });

  // A link created before the draft was frozen has no capture to compare against, and an order
  // recorded by typed name names no Delivery Address at all. Both read as `null` rather than as an
  // absent key — the contract models them as nullable, and a missing key would fail the schema.
  it('projects a link with no capture and no current address as nulls', () => {
    const response = toLineResponse(
      identifiedLineWith([
        identifiedLink({
          customer: null,
          customerName: 'Walk-in, by name',
          snapshot: null,
          current: {
            quantity: 12,
            neededBy: '2026-10-01',
            state: 'unfulfilled',
            outstandingQuantity: 12,
            lastChangedAt: null,
            deliveryAddress: null,
          },
        }),
      ]),
    );

    expect(response).toMatchObject({
      links: [
        {
          customer: null,
          customerName: 'Walk-in, by name',
          snapshot: null,
          current: { deliveryAddress: null, lastChangedAt: null },
        },
      ],
    });
    expect(purchaseDraftLineSchema.safeParse(response).success).toBe(true);
  });
});
