import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PurchaseDraftLineDeliveryRefusalAlert } from 'modules/purchase-draft/components/purchase-draft-line-delivery/components/PurchaseDraftLineDeliveryRefusalAlert';
import { renderWithProviders } from 'test/render';

import type { PurchaseDraftLineIdentified } from '@warehouser/contracts/purchase-drafts';

// AC-15a / sad.md §6.7 step 5 — revising a line's Delivery Mode or Delivery
// Address while any of its links disagrees with the new destination is
// refused, naming **every** disagreeing link and withdrawing none, because
// which link to remove is the member's decision.

const linkIds = {
  agreeing: '00000000-0000-4000-8000-000000000801',
  disagreeingA: '00000000-0000-4000-8000-000000000802',
  disagreeingB: '00000000-0000-4000-8000-000000000803',
};

const line: PurchaseDraftLineIdentified = {
  id: '00000000-0000-4000-8000-000000000601',
  itemId: '00000000-0000-4000-8000-000000000101',
  itemSku: 'WH-100420',
  itemDescription: 'Pallet wrap, 500mm',
  unitOfMeasure: 'each',
  orderedQuantity: 400,
  packagingTypeId: null,
  valueAddingNote: null,
  ending: null,
  deliveryMode: 'direct_to_customer',
  warehouseDestination: null,
  customerDestination: {
    customerDeliveryAddressId: '00000000-0000-4000-8000-000000000301',
    customerId: '00000000-0000-4000-8000-000000000201',
    customerName: 'Nordwind Logistik GmbH',
    addressText: 'Nordkai 8, 21079 Hamburg',
    accessNotes: null,
    frozen: false,
  },
  links: [
    {
      id: linkIds.agreeing,
      customerOrderId: '00000000-0000-4000-8000-000000000901',
      customer: null,
      customerName: 'Nordwind Logistik GmbH',
      statedQuantity: 100,
      snapshot: null,
      current: {
        quantity: 100,
        neededBy: '2026-09-02',
        state: 'unfulfilled',
        outstandingQuantity: 100,
        lastChangedAt: null,
        deliveryAddress: null,
      },
      driftSignals: [],
      allocation: null,
    },
    {
      id: linkIds.disagreeingA,
      customerOrderId: '00000000-0000-4000-8000-000000000902',
      customer: null,
      customerName: 'Baltic Freight OU',
      statedQuantity: 200,
      snapshot: null,
      current: {
        quantity: 200,
        neededBy: '2026-09-05',
        state: 'unfulfilled',
        outstandingQuantity: 200,
        lastChangedAt: null,
        deliveryAddress: null,
      },
      driftSignals: [],
      allocation: null,
    },
    {
      id: linkIds.disagreeingB,
      customerOrderId: '00000000-0000-4000-8000-000000000903',
      customer: null,
      customerName: 'Halden Kontor AS',
      statedQuantity: 100,
      snapshot: null,
      current: {
        quantity: 100,
        neededBy: '2026-09-06',
        state: 'unfulfilled',
        outstandingQuantity: 100,
        lastChangedAt: null,
        deliveryAddress: null,
      },
      driftSignals: [],
      allocation: null,
    },
  ],
};

describe('PurchaseDraftLineDeliveryRefusalAlert', () => {
  it('renders nothing while no refusal has been reported', () => {
    renderWithProviders(
      <PurchaseDraftLineDeliveryRefusalAlert
        disagreeingLinks={undefined}
        line={line}
      />,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('names every disagreeing link and withdraws none (AC-15a)', () => {
    renderWithProviders(
      <PurchaseDraftLineDeliveryRefusalAlert
        disagreeingLinks={[
          {
            purchaseDraftLineLinkId: linkIds.disagreeingA,
            customerOrderId: '00000000-0000-4000-8000-000000000902',
            lineDeliveryAddressId: '00000000-0000-4000-8000-000000000301',
            customerOrderDeliveryAddressId:
              '00000000-0000-4000-8000-000000000302',
          },
          {
            purchaseDraftLineLinkId: linkIds.disagreeingB,
            customerOrderId: '00000000-0000-4000-8000-000000000903',
            lineDeliveryAddressId: '00000000-0000-4000-8000-000000000301',
            customerOrderDeliveryAddressId: null,
          },
        ]}
        line={line}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Baltic Freight OU/u);
    expect(alert).toHaveTextContent(/Halden Kontor AS/u);
    // The agreeing link is not named — the refusal names only what disagrees.
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(alert).toHaveTextContent(/nothing has changed/iu);
    expect(alert).toHaveTextContent(/your decision/iu);
  });
});
