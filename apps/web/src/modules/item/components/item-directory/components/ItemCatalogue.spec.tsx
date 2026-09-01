import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { describe, expect, it, vi } from 'vitest';

import { ItemCatalogue } from 'modules/item/components/item-directory/components/ItemCatalogue';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { Item } from '@warehouser/contracts/items';

// T18 — the Items collection and the states that displace it (frames `XIvAZ`,
// `VHU6r`, and `hWFRW` tile `Sv9md`). DoD: the destination is searchable at
// both viewports — `ITEMS:WATCH` is "read AND SEARCH the Warehouse's Items"
// (spec.md §6) — the empty state names why the list is empty and offers the one
// action that fills it, and the SKU note the design must-preserve list names is
// on screen. Colocated with the component it covers
// (`placing-web-tests.md` §1).

const anItem = (overrides: Partial<Item> = {}): Item => ({
  id: '00000000-0000-4000-8000-000000000260',
  sku: 'WH-100420',
  description: 'Pallet wrap, 500mm',
  unitOfMeasure: 'pieces',
  onHandQuantity: 60,
  deactivatedAt: null,
  namingCustomerOrderCount: 0,
  namingPurchaseDraftLineCount: 0,
  latestAdjustment: null,
  createdAt: '2026-08-01T09:00:00.000Z',
  ...overrides,
});

const catalogueItems = [
  anItem(),
  anItem({
    id: '00000000-0000-4000-8000-000000000261',
    sku: 'WH-100733',
    description: 'Carton 600×400×300',
  }),
];

const renderCatalogue = (items: Item[] = catalogueItems): void => {
  stubAccessServer({ permissionIds: Object.values(PermissionId) });
  const store = authenticatedStore();
  void store.dispatch(
    accessPermissionsApi.util.upsertQueryData(
      'getCurrentAccess',
      accessIds.warehouse,
      {
        warehouseId: accessIds.warehouse,
        roleId: accessIds.managerRole,
        roleKind: 'warehouse_manager',
        permissionIds: Object.values(PermissionId),
        archivedAt: null,
      },
    ),
  );
  renderInEnteredWarehouse(
    <ItemCatalogue
      items={items}
      onAdjustOnHand={vi.fn()}
      onCorrect={vi.fn()}
      onDeactivate={vi.fn()}
    />,
    store,
    accessIds.warehouse,
  );
};

const table = async (): Promise<HTMLElement> =>
  screen.findByRole('grid', { name: /items/iu });

describe('ItemCatalogue', () => {
  it('offers a search field placeholdered as the frames draw it', async () => {
    renderCatalogue();

    const search = await screen.findByPlaceholderText(
      'Search by SKU or description',
    );
    expect(search).toBeVisible();
  });

  it('narrows the loaded collection by SKU', async () => {
    const user = userEvent.setup();
    renderCatalogue();
    await table();

    await user.type(
      screen.getByPlaceholderText('Search by SKU or description'),
      '100733',
    );

    expect(within(await table()).getByText('WH-100733')).toBeVisible();
    expect(within(await table()).queryByText('WH-100420')).toBeNull();
  });

  it('narrows the loaded collection by description too', async () => {
    const user = userEvent.setup();
    renderCatalogue();
    await table();

    await user.type(
      screen.getByPlaceholderText('Search by SKU or description'),
      'pallet',
    );

    expect(within(await table()).getByText('WH-100420')).toBeVisible();
    expect(within(await table()).queryByText('WH-100733')).toBeNull();
  });

  it('names the term that matched nothing rather than showing an empty table', async () => {
    const user = userEvent.setup();
    renderCatalogue();
    await table();

    await user.type(
      screen.getByPlaceholderText('Search by SKU or description'),
      'nothing-here',
    );

    expect(
      await screen.findByText('No item here matches “nothing-here”.'),
    ).toBeVisible();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('names why the collection is empty and offers the one action that fills it (AC-06)', async () => {
    renderCatalogue([]);

    expect(
      await screen.findByText('This warehouse deals in nothing yet'),
    ).toBeVisible();
    expect(
      screen.getByText(
        /an item is what demand and a draft line both name, so it is the first thing to add/iu,
      ),
    ).toBeVisible();
    // Exactly one call to action: the empty state carries it instead of the
    // toolbar, so a member is not offered the same button twice.
    expect(screen.getAllByRole('button', { name: /add item/iu })).toHaveLength(
      1,
    );
    expect(
      screen.queryByPlaceholderText('Search by SKU or description'),
    ).not.toBeInTheDocument();
  });

  it('states the SKU rule under the collection (design must-preserve list)', async () => {
    renderCatalogue();
    await table();

    expect(
      screen.getByText(
        'A SKU is correctable only until something names its item',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        /once a customer order or a purchase draft line names an item, its SKU is fixed for the life of that item/iu,
      ),
    ).toBeVisible();
  });
});
