import { describe, expect, it } from 'vitest';

import { describeLinkDrift } from 'modules/purchase-draft/utils/link-drift';

import type {
  PurchaseDraftLineLinkIdentified,
  PurchaseDraftLineLinkRedacted,
} from '@warehouser/contracts/purchase-drafts';

// AC-16 — "shows a Drift Signal against the draft naming the Customer Order
// **and what changed**, compared against the demand captured when the draft was
// frozen". The signal list alone says only which rule was broken; this is the
// resolver that turns it back into the comparison both halves of the projection
// already carry.

const link = (
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

describe('describeLinkDrift', () => {
  it('reports a raised quantity with both the captured value and the one it moved to', () => {
    expect(
      describeLinkDrift(
        link({
          current: {
            quantity: 1000,
            neededBy: '2026-09-02',
            state: 'unfulfilled',
            outstandingQuantity: 1000,
            lastChangedAt: '2026-08-25T12:00:00.000Z',
            deliveryAddress: null,
          },
          driftSignals: ['quantity_changed'],
        }),
      ),
    ).toEqual([
      {
        kind: 'quantityRaised',
        quantities: { from: 800, to: 1000 },
        dates: { neededBy: '2026-09-02' },
        // The moment the order moved rides along with every comparison it
        // caused, so the sentence can be dated (AC-16, frame `F0SpRx`).
        changedAt: '2026-08-25T12:00:00.000Z',
      },
    ]);
  });

  // The direction is what the reader is being told: less demand than was
  // ordered for is a different decision from more.
  it('distinguishes a lowered quantity from a raised one', () => {
    const [drift] = describeLinkDrift(
      link({
        current: {
          quantity: 600,
          neededBy: '2026-09-02',
          state: 'unfulfilled',
          outstandingQuantity: 600,
          lastChangedAt: null,
          deliveryAddress: null,
        },
        driftSignals: ['quantity_changed'],
      }),
    );

    expect(drift?.kind).toBe('quantityLowered');
    expect(drift?.quantities).toEqual({ from: 800, to: 600 });
  });

  it('reports a moved needed-by date as the two days it moved between', () => {
    expect(
      describeLinkDrift(
        link({
          current: {
            quantity: 800,
            neededBy: '2026-09-09',
            state: 'unfulfilled',
            outstandingQuantity: 800,
            lastChangedAt: null,
            deliveryAddress: null,
          },
          driftSignals: ['needed_by_moved'],
        }),
      ),
    ).toEqual([
      {
        kind: 'needed_by_moved',
        quantities: {},
        dates: { from: '2026-09-02', to: '2026-09-09' },
        changedAt: null,
      },
    ]);
  });

  it('reports every comparison a link makes, not only the first', () => {
    expect(
      describeLinkDrift(
        link({
          current: {
            quantity: 1000,
            neededBy: '2026-09-09',
            state: 'unfulfilled',
            outstandingQuantity: 1000,
            lastChangedAt: null,
            deliveryAddress: null,
          },
          driftSignals: ['quantity_changed', 'needed_by_moved'],
        }),
      ).map((drift) => drift.kind),
    ).toEqual(['quantityRaised', 'needed_by_moved']);
  });

  // A cancellation and a fulfilment have no "after" value to compare against;
  // what the reader needs is the state itself.
  it.each(['cancelled', 'became_fulfilled'] as const)(
    'reports %s as a state change with no values to compare',
    (signal) => {
      expect(describeLinkDrift(link({ driftSignals: [signal] }))).toEqual([
        { kind: signal, quantities: {}, dates: {}, changedAt: null },
      ]);
    },
  );

  // AC-16 — a link that drifted in two ways moved once, so both comparisons
  // carry the same moment rather than each resolving one of its own.
  it('carries the moment the order moved onto every comparison the link makes', () => {
    expect(
      describeLinkDrift(
        link({
          current: {
            quantity: 1000,
            neededBy: '2026-09-09',
            state: 'unfulfilled',
            outstandingQuantity: 1000,
            lastChangedAt: '2026-08-25T12:00:00.000Z',
            deliveryAddress: null,
          },
          driftSignals: ['quantity_changed', 'needed_by_moved'],
        }),
      ).map((drift) => drift.changedAt),
    ).toEqual(['2026-08-25T12:00:00.000Z', '2026-08-25T12:00:00.000Z']);
  });

  // An order that has not been changed since it was recorded has no such
  // moment, and the projection reports none rather than its creation time.
  it('reports no moment for a link whose Customer Order carries none', () => {
    expect(
      describeLinkDrift(link({ driftSignals: ['cancelled'] }))[0]?.changedAt,
    ).toBeNull();
  });

  // An unfrozen draft captured nothing, so there is nothing to compare against
  // and the resolver reports no comparison rather than inventing one.
  it('reports no value comparison for a link carrying no Demand Snapshot', () => {
    expect(
      describeLinkDrift(
        link({ snapshot: null, driftSignals: ['quantity_changed'] }),
      ),
    ).toEqual([]);
  });
  // T23 / AC-18 — Address Drift is the comparison "this order is going
  // somewhere else now", so the drift carries **both** addresses: the one
  // frozen for the link and the one the demand now expects. Reporting only
  // that a disagreement exists throws away the half the member acts on.
  it('names both addresses of an address drift, frozen and now expected', () => {
    expect(
      describeLinkDrift(
        link({
          snapshot: {
            capturedDeliveryAddressId: '00000000-0000-4000-8000-000000000301',
            capturedDeliveryAddressText: 'Nordkai 8, 21079 Hamburg',
            capturedQuantity: 800,
            capturedNeededBy: '2026-09-02',
            capturedState: 'unfulfilled',
          },
          current: {
            quantity: 800,
            neededBy: '2026-09-02',
            state: 'unfulfilled',
            outstandingQuantity: 800,
            lastChangedAt: '2026-08-26T12:00:00.000Z',
            deliveryAddress: {
              deliveryAddressId: '00000000-0000-4000-8000-000000000302',
              addressText: 'Speicherweg 4, 21107 Hamburg',
              accessNotes: null,
              isMain: true,
              deactivatedAt: null,
            },
          },
          driftSignals: ['delivery_address_changed'],
        }),
      ),
    ).toEqual([
      {
        kind: 'addressRedirected',
        quantities: {},
        dates: {},
        addresses: {
          from: 'Nordkai 8, 21079 Hamburg',
          to: 'Speicherweg 4, 21107 Hamburg',
        },
        changedAt: '2026-08-26T12:00:00.000Z',
      },
    ]);
  });

  // AC-09a — a member without `CUSTOMERS:WATCH` reads a link from which both
  // addresses are absent as properties. *That* the order was redirected is a
  // fact about the draft and is still reported; where it now goes is not.
  it('reports an address drift without naming an address when identity is withheld', () => {
    const redacted = {
      id: '00000000-0000-4000-8000-000000000301',
      customerOrderId: '00000000-0000-4000-8000-000000000401',
      statedQuantity: 800,
      snapshot: {
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
      },
      driftSignals: ['delivery_address_changed'],
      allocation: null,
    } as const satisfies PurchaseDraftLineLinkRedacted;

    expect(describeLinkDrift(redacted)).toEqual([
      {
        kind: 'addressRedirectedWithheld',
        quantities: {},
        dates: {},
        changedAt: null,
      },
    ]);
  });
});
