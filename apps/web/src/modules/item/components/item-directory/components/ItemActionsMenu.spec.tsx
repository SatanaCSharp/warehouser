import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { describe, expect, it, vi } from 'vitest';

import { ItemActionsMenu } from 'modules/item/components/item-directory/components/ItemActionsMenu';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { Item } from '@warehouser/contracts/items';

// F14 — reactivation used to be assembled by `ItemDirectory` and handed down
// through the table's row renderer. A React Aria collection caches a row's
// element tree per record, so that handler kept whichever Warehouse
// `useEnteredWarehouse()` had resolved when the row was first built — an empty
// string while the entry verdict was still resolving
// (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
//
// It is run here instead, in the component a cell renders, which is re-rendered
// into the real tree and therefore reads the entered Warehouse itself. These
// cases pin the address the request is sent to, and that deactivating is still
// only reported upward — it opens a confirmation, so it must not write.

const inactiveItem = (): Item => ({
  id: '00000000-0000-4000-8000-000000000260',
  sku: 'SKU-199',
  description: 'Cable, 3x2.5mm2',
  unitOfMeasure: 'metre',
  onHandQuantity: 0,
  deactivatedAt: '2026-08-10T09:00:00.000Z',
  namingCustomerOrderCount: 2,
  namingPurchaseDraftLineCount: 0,
  latestAdjustment: null,
  createdAt: '2026-08-01T09:00:00.000Z',
});

const activeItem = (): Item => ({ ...inactiveItem(), deactivatedAt: null });

const renderMenu = (item: Item): { onDeactivate: () => void } => {
  stubAccessServer({ permissionIds: Object.values(PermissionId) });
  const onDeactivate = vi.fn();
  renderInEnteredWarehouse(
    <ItemActionsMenu
      item={item}
      onAdjustOnHand={vi.fn()}
      onCorrect={vi.fn()}
      onDeactivate={onDeactivate}
    />,
    authenticatedStore(),
    accessIds.warehouse,
  );
  return { onDeactivate };
};

const requestedUrls = (): string[] =>
  vi
    .mocked(globalThis.fetch)
    .mock.calls.map(([input]) =>
      String(input instanceof Request ? input.url : input),
    );

const chooseAction = async (name: RegExp): Promise<void> => {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /actions/iu }));
  await user.click(await screen.findByRole('menuitem', { name }));
};

describe('ItemActionsMenu', () => {
  it('reactivates against the Warehouse the address names, without a dialog (AC-06d)', async () => {
    renderMenu(inactiveItem());

    await chooseAction(/reactivate/iu);

    expect(requestedUrls()).toContain(
      `/api/v1/warehouses/${accessIds.warehouse}/items/${inactiveItem().id}/deactivation`,
    );
  });

  it('only reports a deactivation upward, so the confirmation decides (AC-06d)', async () => {
    const { onDeactivate } = renderMenu(activeItem());

    await chooseAction(/deactivate/iu);

    expect(onDeactivate).toHaveBeenCalledWith(activeItem());
    expect(
      requestedUrls().filter((url) => url.includes('/deactivation')),
    ).toStrictEqual([]);
  });
});
