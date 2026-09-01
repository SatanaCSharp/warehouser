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
    namingCustomerOrderCount: 0,
    namingPurchaseDraftLineCount: 0,
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
    namingCustomerOrderCount: 0,
    namingPurchaseDraftLineCount: 0,
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

  // The picker's three sibling fields on a Purchase Draft Line all state why
  // they are refused; before this prop existed the picker alone could not, so a
  // member reaching it with a screen reader met a disabled control with no
  // reason attached (AC-15, AC-23).
  it('states a caller’s reason under the field and describes the control by it', () => {
    renderWithProviders(
      <ItemPicker
        description="Frozen — the draft records what the supplier was told."
        isDisabled
        items={items()}
        value=""
        onChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: /item/iu });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAccessibleDescription(
      'Frozen — the draft records what the supplier was told.',
    );
  });

  it('renders no description when the caller states none', () => {
    renderWithProviders(
      <ItemPicker items={items()} value="" onChange={vi.fn()} />,
    );

    expect(
      screen.getByRole('button', { name: /item/iu }),
    ).not.toHaveAccessibleDescription();
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

  // F11 — a record written before the Item was deactivated stays fully
  // editable server-side (AC-06d), but a `Select` whose collection holds no
  // option for its own value renders blank, so that record presented as though
  // it named nothing.
  it('displays a deactivated Item it already names when the caller retains it (AC-06d)', () => {
    const [, inactive] = items();
    renderWithProviders(
      <ItemPicker
        items={items()}
        retainsDeactivatedValue
        value={inactive.id}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /item/iu })).toHaveTextContent(
      'SKU-INACTIVE · Retired crate',
    );
  });

  it('retains only the Item it already names, never another deactivated one (AC-06a)', async () => {
    const user = userEvent.setup();
    const [active] = items();
    renderWithProviders(
      <ItemPicker
        items={items()}
        retainsDeactivatedValue
        value={active.id}
        onChange={vi.fn()}
      />,
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
