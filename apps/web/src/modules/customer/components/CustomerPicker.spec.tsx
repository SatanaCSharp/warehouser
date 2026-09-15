import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  Customer,
  CustomerDeliveryAddress,
} from '@warehouser/contracts/customers';
import { CustomerPicker } from 'modules/customer/components/CustomerPicker';
import { selectHeroOption } from 'test/hero-select';
import { renderWithProviders } from 'test/render';
import { describe, expect, it, vi } from 'vitest';

// delivery-addresses T21 — the Customer picker on `modules/customer`'s
// declared public surface, which `modules/customer-order` and
// `modules/purchase-draft` reach through
// (`test/module-boundaries/module-surface.ts`). Colocated with its subject
// (`placing-web-tests.md` §1).
//
// Its load-bearing rule is AC-06: an Inactive Customer is **absent** from the
// offer rather than shown and disabled, so a record already naming it keeps
// counting while a new one cannot pick it up again.

const ids = {
  north: '00000000-0000-4000-8000-000000000201',
  south: '00000000-0000-4000-8000-000000000202',
  hafen: '00000000-0000-4000-8000-000000000301',
  dock: '00000000-0000-4000-8000-000000000302',
} as const;

const address = (
  id: string,
  addressText: string,
  overrides: Partial<CustomerDeliveryAddress> = {},
): CustomerDeliveryAddress => ({
  id,
  customerId: ids.north,
  addressText,
  accessNotes: null,
  isMain: false,
  deactivatedAt: null,
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
  ...overrides,
});

const addresses: CustomerDeliveryAddress[] = [
  address(ids.hafen, 'Hafenstraße 14, 20457 Hamburg', { isMain: true }),
  address(ids.dock, 'Dockweg 3, 20457 Hamburg', {
    deactivatedAt: '2026-09-02T12:00:00.000Z',
  }),
];

const north: Customer = {
  id: ids.north,
  name: 'Nordwind Logistik GmbH',
  deactivatedAt: null,
  mainDeliveryAddressId: ids.hafen,
  deliveryAddresses: addresses,
  recordedByUserId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
};

const south: Customer = {
  ...north,
  id: ids.south,
  name: 'Südsee Handel AG',
  deactivatedAt: '2026-09-03T08:00:00.000Z',
  deliveryAddresses: [],
};

describe('CustomerPicker', () => {
  // AC-06 — deactivating stops the Customer being offered when demand is
  // recorded; it is absent from the list rather than listed and disabled.
  it('offers the active Customers and never an Inactive one', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CustomerPicker customers={[north, south]} value="" onChange={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: /customer/iu }));

    expect(
      screen.getAllByRole('option', {
        name: 'Nordwind Logistik GmbH',
        hidden: true,
      }),
    ).not.toHaveLength(0);
    expect(
      screen.queryAllByRole('option', {
        name: 'Südsee Handel AG',
        hidden: true,
      }),
    ).toHaveLength(0);
  });

  it('reports the chosen Customer to its caller', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <CustomerPicker customers={[north]} value="" onChange={onChange} />,
    );

    await selectHeroOption(
      user,
      screen.getByRole('button', { name: /customer/iu }),
      'Nordwind Logistik GmbH',
    );

    expect(onChange).toHaveBeenCalledWith(ids.north);
  });
});
