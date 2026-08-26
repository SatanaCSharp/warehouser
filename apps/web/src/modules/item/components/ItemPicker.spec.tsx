import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ItemPicker } from 'modules/item/components/ItemPicker';
import { renderWithProviders } from 'test/render';

import type { Item } from '@warehouser/contracts/items';

// T18 — the Item picker `modules/customer-order` and `modules/purchase-draft`
// reach through this module's declared public surface (AC-06a). DoD: "A test
// proves an inactive Item is chipped as such and is not offered by the
// picker". Colocated with the component it covers (`placing-web-tests.md`
// §1).

const items = (): Item[] => [
  {
    id: '00000000-0000-4000-8000-000000000201',
    sku: 'SKU-ACTIVE',
    description: 'Active crate',
    unitOfMeasure: 'each',
    onHandQuantity: 10,
    deactivatedAt: null,
    latestAdjustment: null,
    createdAt: '2026-08-01T09:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000202',
    sku: 'SKU-INACTIVE',
    description: 'Retired crate',
    unitOfMeasure: 'each',
    onHandQuantity: 0,
    deactivatedAt: '2026-08-10T09:00:00.000Z',
    latestAdjustment: null,
    createdAt: '2026-08-01T09:00:00.000Z',
  },
];

describe('ItemPicker', () => {
  it('offers an active Item by its SKU (AC-06a)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ItemPicker items={items()} value="" onChange={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: /item/iu }));

    expect(
      screen.getAllByRole('option', { name: /sku-active/iu, hidden: true }),
    ).not.toHaveLength(0);
  });

  it('never offers a deactivated Item, absent rather than shown and disabled (AC-06d)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ItemPicker items={items()} value="" onChange={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: /item/iu }));

    expect(
      screen.queryAllByRole('option', {
        name: /sku-inactive/iu,
        hidden: true,
      }),
    ).toStrictEqual([]);
  });
});
