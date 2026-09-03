import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CustomerDeliveryAddressPicker } from 'modules/customer/components/CustomerDeliveryAddressPicker';
import { renderWithProviders } from 'test/render';

import type { CustomerDeliveryAddress } from '@warehouser/contracts/customers';

// delivery-addresses T21 — the Delivery Address picker on `modules/customer`'s
// declared public surface. Colocated with its subject
// (`placing-web-tests.md` §1).
//
// Its load-bearing rule is AC-06a and tile `u12PYn`: an Inactive address is
// **absent** from the offer rather than shown and disabled, **with a line
// saying so**, and the address a record already names comes back only because
// it is already that field's value.

const ids = {
  north: '00000000-0000-4000-8000-000000000201',
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

describe('CustomerDeliveryAddressPicker', () => {
  // AC-06a, tile `u12PYn` — an Inactive address is absent from the picker
  // rather than shown and disabled, **with a line saying so**, so a member
  // looking for an address they know exists is told why it is not there.
  it('offers the active addresses, omits the Inactive one, and says so', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CustomerDeliveryAddressPicker
        addresses={addresses}
        value=""
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Inactive addresses are not offered here.'),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /delivery address/iu }),
    );

    expect(
      screen.getAllByRole('option', {
        name: 'Hafenstraße 14, 20457 Hamburg · Main',
        hidden: true,
      }),
    ).not.toHaveLength(0);
    expect(
      screen.queryAllByRole('option', { name: /Dockweg 3/u, hidden: true }),
    ).toHaveLength(0);
  });

  // AC-06a's other half — a record already naming a since-deactivated address
  // keeps displaying it, so the field it is the value of is not blank. The
  // offer is never widened: only the address the field already names returns.
  it('keeps a since-deactivated address listed when it is already the value', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CustomerDeliveryAddressPicker
        retainsDeactivatedValue
        addresses={addresses}
        value={ids.dock}
        onChange={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: /delivery address/iu }),
    );

    expect(
      screen.getAllByRole('option', { name: /Dockweg 3/u, hidden: true }),
    ).not.toHaveLength(0);
  });
});
