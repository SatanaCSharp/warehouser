import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CustomerOrderPicker } from 'modules/customer-order/components/CustomerOrderPicker';
import { renderWithProviders } from 'test/render';

import type { CustomerOrder } from '@warehouser/contracts/customer-orders';

// T19 — the Customer Order picker `modules/purchase-draft` reaches through
// this module's declared public surface (AC-10, AC-11a). Colocated with the
// component it covers (`placing-web-tests.md` §1).

const customerOrders = (): CustomerOrder[] => [
  {
    id: '00000000-0000-4000-8000-000000000301',
    itemId: '00000000-0000-4000-8000-000000000240',
    customerName: 'Nordwind Logistik',
    quantity: 500,
    outstandingQuantity: 500,
    neededBy: '2026-09-01',
    state: 'unfulfilled',
    cancellationReason: null,
    recordedByUserId: '00000000-0000-4000-8000-000000000003',
    cancelledByUserId: null,
    cancelledAt: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
  },
];

describe('CustomerOrderPicker', () => {
  it('offers an Unfulfilled Customer Order by its customer name (AC-10)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CustomerOrderPicker
        customerOrders={customerOrders()}
        value=""
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /customer order/iu }));

    expect(
      screen.getAllByRole('option', {
        name: /nordwind logistik/iu,
        hidden: true,
      }),
    ).not.toHaveLength(0);
  });

  it('offers no option when the Item carries no Unfulfilled demand', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CustomerOrderPicker customerOrders={[]} value="" onChange={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: /customer order/iu }));

    const options = screen
      .queryAllByRole('option', { hidden: true })
      .filter((option) => option.textContent?.trim() !== '');
    expect(options).toStrictEqual([]);
  });
});
