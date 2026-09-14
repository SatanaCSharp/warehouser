import type {
  PurchaseDraftLineLinkIdentified,
  PurchaseDraftLineLinkRedacted,
} from '@warehouser/contracts/purchase-drafts';
import {
  linkAddressComparison,
  purchaseDraftLinkIdentity,
} from 'modules/purchase-draft/utils/link-identity';
import { describe, expect, it } from 'vitest';

// AC-09a / AC-18, AC-18a — the two readers this module exports were exercised only through the
// components that render them, and only ever with a typed-name link: the arm that names a Customer
// and the arm that carries both addresses had no direct coverage at all. Both are the readers that
// decide what a member without `CUSTOMERS:WATCH` is shown, so every exit of each is pinned here.
//
// The redacted arm is built by deleting the two keys rather than nulling them: the contract's
// strict object makes their *presence* a validation failure, so absence is what proves the
// redaction, and a fixture that nulled them would test a shape the server cannot send.

const identifiedLink = (
  overrides: Partial<PurchaseDraftLineLinkIdentified> = {},
): PurchaseDraftLineLinkIdentified => ({
  id: '00000000-0000-4000-8000-000000000301',
  customerOrderId: '00000000-0000-4000-8000-000000000401',
  customer: null,
  customerName: 'Nordwind Logistik GmbH',
  statedQuantity: 800,
  snapshot: {
    capturedDeliveryAddressId: null,
    capturedDeliveryAddressText: null,
    capturedQuantity: 800,
    capturedNeededBy: '2026-09-02',
    capturedState: 'unfulfilled',
  },
  current: {
    quantity: 800,
    neededBy: '2026-09-02',
    state: 'unfulfilled',
    outstandingQuantity: 800,
    lastChangedAt: null,
    deliveryAddress: null,
  },
  driftSignals: [],
  allocation: null,
  ...overrides,
});

const redactedLink = (): PurchaseDraftLineLinkRedacted => {
  const { customer, customerName, ...redacted } = identifiedLink();
  void customer;
  void customerName;

  return redacted;
};

describe('purchaseDraftLinkIdentity', () => {
  // The branch no test reached. A link naming a Customer reads that Customer live, so the name is
  // taken off `customer` rather than off the link — correcting a Customer's name has to change
  // every link that names it.
  it('reads a link naming a Customer as that Customer', () => {
    expect(
      purchaseDraftLinkIdentity(
        identifiedLink({
          customer: {
            id: '00000000-0000-4000-8000-000000000501',
            name: 'Nordwind Logistik GmbH',
          },
          customerName: null,
        }),
      ),
    ).toEqual({
      kind: 'namedCustomer',
      customerId: '00000000-0000-4000-8000-000000000501',
      name: 'Nordwind Logistik GmbH',
    });
  });

  it('reads a link recorded by typed name as that typed name', () => {
    expect(purchaseDraftLinkIdentity(identifiedLink())).toEqual({
      kind: 'typedName',
      customerId: null,
      name: 'Nordwind Logistik GmbH',
    });
  });

  // The redaction: both keys absent, which is the only shape the server sends to an actor without
  // `CUSTOMERS:WATCH`. It must not read as "a Customer-naming link with the name hidden" — the
  // name slot is `null` rather than blank, so no surface can render it as an empty customer.
  it('reads a redacted link as withheld, carrying no name slot at all', () => {
    expect(purchaseDraftLinkIdentity(redactedLink())).toEqual({
      kind: 'withheld',
      customerId: null,
      name: null,
    });
  });

  // The fail-safe. An identified link carrying neither a Customer nor a typed name is a shape the
  // contract refuses; reading it as `withheld` withholds where it cannot be sure rather than
  // inventing a name.
  it('withholds an identified link that names nobody rather than inventing a name', () => {
    expect(
      purchaseDraftLinkIdentity(
        identifiedLink({ customer: null, customerName: null }),
      ),
    ).toEqual({ kind: 'withheld', customerId: null, name: null });
  });
});

describe('linkAddressComparison', () => {
  const withAddresses = (
    capturedText: string | null,
    currentText: string | null,
  ): PurchaseDraftLineLinkIdentified =>
    identifiedLink({
      snapshot: {
        capturedDeliveryAddressId:
          capturedText === null ? null : '00000000-0000-4000-8000-000000000301',
        capturedDeliveryAddressText: capturedText,
        capturedQuantity: 800,
        capturedNeededBy: '2026-09-02',
        capturedState: 'unfulfilled',
      },
      current: {
        quantity: 800,
        neededBy: '2026-09-02',
        state: 'unfulfilled',
        outstandingQuantity: 800,
        lastChangedAt: null,
        deliveryAddress:
          currentText === null
            ? null
            : {
                deliveryAddressId: '00000000-0000-4000-8000-000000000302',
                addressText: currentText,
                accessNotes: null,
                isMain: false,
                deactivatedAt: null,
              },
      },
    });

  it('states both halves of the comparison when the link carries both', () => {
    expect(
      linkAddressComparison(
        withAddresses(
          'Nordkai 8, 21079 Hamburg',
          'Speicherweg 4, 21107 Hamburg',
        ),
      ),
    ).toEqual({
      captured: 'Nordkai 8, 21079 Hamburg',
      current: 'Speicherweg 4, 21107 Hamburg',
    });
  });

  // A redacted link carries neither address, and the comparison answers `null` rather than a pair
  // of blanks — that is what lets the drift copy state the disagreement without naming an address
  // the member may not read.
  it('answers nothing for a redacted link', () => {
    expect(linkAddressComparison(redactedLink())).toBeNull();
  });

  // Either half missing is not a comparison. An order recorded by typed name names no address at
  // all, so its captured half is absent; an order whose current address was never resolved leaves
  // the other half absent. Neither is a drift to state.
  it.each([
    ['no captured address', null, 'Speicherweg 4, 21107 Hamburg'],
    ['no current address', 'Nordkai 8, 21079 Hamburg', null],
    ['neither address', null, null],
  ])('answers nothing when there is %s', (_case, captured, current) => {
    expect(linkAddressComparison(withAddresses(captured, current))).toBeNull();
  });
});
