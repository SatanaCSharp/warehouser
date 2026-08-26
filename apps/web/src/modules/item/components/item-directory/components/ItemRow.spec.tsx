import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { describe, expect, it, vi } from 'vitest';

import { ItemRow } from 'modules/item/components/item-directory/components/ItemRow';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { Item } from '@warehouser/contracts/items';

// T18 — the Items destination's row (design-handoff.md `Ordering/Item Row`
// `xEIH0`). DoD: "A component test proves the on-hand cell renders the
// counted figure AND its reason line — the reason is part of the contract,
// not decoration" plus AC-06d's chip-and-still-readable case. Colocated with
// the row it covers (`placing-web-tests.md` §1).
//
// The row reads its own per-Item actions from the cached current-access
// projection (`docs/system/adr/19-08-2026-declarative-permission-gates.md`),
// so it is rendered as a descendant of an entered Warehouse match —
// `renderInEnteredWarehouse`, exactly as `WarehousePermissionGate.spec.tsx`
// and `MemberList.spec.tsx` render the components that read the same
// projection.

const activeItem = (overrides: Partial<Item> = {}): Item => ({
  id: '00000000-0000-4000-8000-000000000200',
  sku: 'SKU-100',
  description: 'Corrugated box, 12x12x12',
  unitOfMeasure: 'each',
  onHandQuantity: 42,
  deactivatedAt: null,
  latestAdjustment: {
    countedQuantity: 42,
    reason: 'Cycle count',
    adjustedAt: '2026-08-20T09:00:00.000Z',
  },
  createdAt: '2026-08-01T09:00:00.000Z',
  ...overrides,
});

const renderRow = (
  item: Item,
  permissionIds: readonly PermissionId[] = Object.values(PermissionId),
): void => {
  stubAccessServer({ permissionIds });
  const store = authenticatedStore();
  renderInEnteredWarehouse(
    <ItemRow
      item={item}
      onAdjustOnHand={vi.fn()}
      onCorrect={vi.fn()}
      onToggleActive={vi.fn()}
    />,
    store,
    accessIds.warehouse,
  );
};

describe('ItemRow', () => {
  it('renders the on-hand figure together with its reason line, not the figure alone', async () => {
    renderRow(activeItem());

    const row = await screen.findByRole('row', { name: /sku-100/iu });
    expect(row).toHaveTextContent('42');
    // The reason is part of the contract, not decoration: a row rendering
    // "42" without "Cycle count" anywhere would still pass a figure-only
    // assertion, which is exactly what this test refuses to accept.
    expect(row).toHaveTextContent('Cycle count');
  });

  it('renders nothing on hand with no reason line when the Item has never been adjusted', async () => {
    renderRow(activeItem({ onHandQuantity: 0, latestAdjustment: null }));

    const row = await screen.findByRole('row', { name: /sku-100/iu });
    expect(row).toHaveTextContent('0');
  });

  it('chips a deactivated Item as Inactive while keeping its row readable (AC-06d)', async () => {
    renderRow(activeItem({ deactivatedAt: '2026-08-21T09:00:00.000Z' }));

    const row = await screen.findByRole('row', { name: /sku-100/iu });
    expect(row).toHaveTextContent('Inactive');
    // Still readable: the SKU, description and figures remain in the DOM
    // rather than being replaced by the chip.
    expect(row).toHaveTextContent('Corrugated box, 12x12x12');
    expect(row).toHaveTextContent('42');
  });

  it('does not chip an active Item as Inactive', async () => {
    renderRow(activeItem());

    const row = await screen.findByRole('row', { name: /sku-100/iu });
    expect(row).not.toHaveTextContent('Inactive');
  });

  // The ADR's actual guarantee: an actor holding none of the write
  // Permissions is offered no actions menu at all — absent, not disabled.
  it('offers no actions menu to an actor holding none of the write Permissions', async () => {
    renderRow(activeItem(), []);

    await screen.findByRole('row', { name: /sku-100/iu });
    expect(
      screen.queryByRole('button', { name: /actions for/iu }),
    ).not.toBeInTheDocument();
  });

  it('offers only the correct action to an actor holding ITEMS:UPDATE alone', async () => {
    const user = userEvent.setup();
    renderRow(activeItem(), [PermissionId.ITEMS_UPDATE]);

    const trigger = await screen.findByRole('button', {
      name: /actions for/iu,
    });
    await user.click(trigger);

    const menu = screen.getByRole('menu', { name: /actions for/iu });
    expect(
      within(menu).getByRole('menuitem', { name: /correct item/iu }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole('menuitem', { name: /deactivate/iu }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole('menuitem', {
        name: /adjust on-hand quantity/iu,
      }),
    ).not.toBeInTheDocument();
  });

  it('offers only the deactivate action to an actor holding ITEMS:DEACTIVATE alone', async () => {
    const user = userEvent.setup();
    renderRow(activeItem(), [PermissionId.ITEMS_DEACTIVATE]);

    const trigger = await screen.findByRole('button', {
      name: /actions for/iu,
    });
    await user.click(trigger);

    const menu = screen.getByRole('menu', { name: /actions for/iu });
    expect(
      within(menu).getByRole('menuitem', { name: /deactivate/iu }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole('menuitem', { name: /correct item/iu }),
    ).not.toBeInTheDocument();
  });

  it('offers only the adjust-on-hand action to an actor holding ITEM_STOCK:ADJUST alone', async () => {
    const user = userEvent.setup();
    renderRow(activeItem(), [PermissionId.ITEM_STOCK_ADJUST]);

    const trigger = await screen.findByRole('button', {
      name: /actions for/iu,
    });
    await user.click(trigger);

    const menu = screen.getByRole('menu', { name: /actions for/iu });
    expect(
      within(menu).getByRole('menuitem', {
        name: /adjust on-hand quantity/iu,
      }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole('menuitem', { name: /correct item/iu }),
    ).not.toBeInTheDocument();
  });
});
