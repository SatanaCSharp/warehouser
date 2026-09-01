import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import { itemApi } from 'modules/item/api/item-api';
import { ItemPage } from 'modules/item/page';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import { ROUTES } from 'shared/constants/routes';
import { accessIds, authenticatedStore } from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { Item } from '@warehouser/contracts/items';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type { AppStore } from 'store';

// T18 — the Items destination's masthead and its denial (frames `XIvAZ`,
// `VHU6r`, and `hWFRW` tiles `eHcB7` / `TPZTI`). DoD: the destination states
// what a SKU means here, an actor without `ITEMS:WATCH` is denied without a SKU
// or a description leaking, and an archived Warehouse is entered read-only with
// its reason stated once (AC-23). Colocated with the page it covers
// (`placing-web-tests.md` §1).

/**
 * The sentence `ArchivedWarehouseNotice` carries under
 * `ARCHIVED_WAREHOUSE_REASON_ID` — the one every control this page disables
 * points at. Matching the *description*, not the heading, is what proves the
 * reference lands on the element that actually holds the id.
 */
const ARCHIVED_REASON =
  /nothing that changes what it holds is authorized any more/iu;

const secretItem: Item = {
  id: '00000000-0000-4000-8000-000000000270',
  sku: 'SKU-SECRET',
  description: 'Should never render',
  unitOfMeasure: 'each',
  onHandQuantity: 999,
  deactivatedAt: null,
  namingCustomerOrderCount: 0,
  namingPurchaseDraftLineCount: 0,
  latestAdjustment: null,
  createdAt: '2026-08-01T09:00:00.000Z',
};

const seedAccess = (permissionIds: readonly PermissionId[]): AppStore => {
  const store = authenticatedStore();
  void store.dispatch(
    accessPermissionsApi.util.upsertQueryData(
      'getCurrentAccess',
      accessIds.warehouse,
      {
        warehouseId: accessIds.warehouse,
        roleId: accessIds.managerRole,
        roleKind: 'warehouse_manager',
        permissionIds: [...permissionIds],
        archivedAt: null,
      },
    ),
  );
  void store.dispatch(
    itemApi.util.upsertQueryData('listItems', accessIds.warehouse, [
      secretItem,
    ]),
  );
  return store;
};

/** AC-23 — the read-only verdict is published by the Warehouse match itself. */
const renderInArchivedWarehouse = (): void => {
  const store = seedAccess(Object.values(PermissionId));
  const testRootRoute = createRootRouteWithContext<{ store: AppStore }>()({
    component: () => <Outlet />,
  });
  const warehouseTestRoute = createRoute({
    getParentRoute: () => testRootRoute,
    path: ROUTES.WAREHOUSE,
    beforeLoad: ({ params }): WarehouseEntryVerdict => ({
      status: 'entered-read-only',
      reason: 'archived',
      warehouseId: params.warehouseId,
    }),
    component: () => <Outlet />,
  });
  const subjectRoute = createRoute({
    getParentRoute: () => warehouseTestRoute,
    path: '/',
    component: ItemPage,
  });

  const router = createRouter({
    routeTree: testRootRoute.addChildren([
      warehouseTestRoute.addChildren([subjectRoute]),
    ]),
    context: { store },
    history: createMemoryHistory({
      initialEntries: [`/warehouses/${accessIds.warehouse}`],
    }),
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
};

describe('ItemPage', () => {
  it('states what a SKU means in this Warehouse under its heading', async () => {
    const store = seedAccess([PermissionId.ITEMS_WATCH]);
    renderInEnteredWarehouse(<ItemPage />, store, accessIds.warehouse);

    expect(
      await screen.findByRole('heading', { name: 'Items', level: 1 }),
    ).toBeVisible();
    expect(
      screen.getByText(
        /a SKU identifies one item inside this warehouse and nowhere else — the same SKU in another warehouse names an unrelated item/iu,
      ),
    ).toBeVisible();
  });

  it('denies an actor without ITEMS:WATCH, leaking no SKU, description or figure', async () => {
    // The catalogue read is seeded as a *successful*, non-empty response: if
    // the Permission check were ever dropped, an unseeded read would still
    // render an empty surface and the test would pass for the wrong reason.
    const store = seedAccess([]);
    renderInEnteredWarehouse(<ItemPage />, store, accessIds.warehouse);

    expect(await screen.findByText('Items could not be loaded.')).toBeVisible();
    expect(screen.queryByText('SKU-SECRET')).not.toBeInTheDocument();
    expect(screen.queryByText('Should never render')).not.toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('renders no archived notice in a Warehouse still in operation', async () => {
    const store = seedAccess([PermissionId.ITEMS_WATCH]);
    renderInEnteredWarehouse(<ItemPage />, store, accessIds.warehouse);

    await screen.findByRole('heading', { name: 'Items', level: 1 });
    expect(
      screen.queryByText(/this warehouse has been archived/iu),
    ).not.toBeInTheDocument();
  });

  // The reference itself is only worth as much as what it resolves to. Asserted
  // one level down — on `ItemDirectory` alone — the id would dangle in every
  // run, because the notice that carries it belongs to this page: the
  // assertion would pass while a screen reader heard nothing. So the resolution
  // is proved here, where the notice and the controls are rendered together
  // (`toHaveAccessibleDescription` resolves `aria-describedby` and fails on a
  // dangling id exactly as an assistive technology does).
  it('resolves every disabled control’s stated reason to the notice on this page (AC-23)', async () => {
    const user = userEvent.setup();
    renderInArchivedWarehouse();

    const addItem = await screen.findByRole('button', { name: /add item/iu });
    expect(addItem).toBeDisabled();
    expect(addItem).toHaveAccessibleDescription(ARCHIVED_REASON);

    const menuTrigger = (
      await screen.findAllByRole('button', { name: /actions for SKU-SECRET/iu })
    )[0];
    await user.click(menuTrigger);

    const menu = screen.getByRole('menu', { name: /actions for/iu });
    const actions = within(menu).getAllByRole('menuitem');
    expect(actions.length).toBeGreaterThan(0);
    actions.forEach((action) => {
      expect(action).toHaveAttribute('aria-disabled', 'true');
      expect(action).toHaveAccessibleDescription(ARCHIVED_REASON);
    });
  });

  it('states the archived reason once, beside a chip, and keeps reading (AC-23)', async () => {
    renderInArchivedWarehouse();

    expect(await screen.findByText('Archived warehouse')).toBeVisible();
    expect(
      screen.getByText(/this warehouse has been archived/iu),
    ).toBeVisible();
    // Watch capabilities keep reading on exactly the terms that applied before
    // archiving, so the catalogue is still on screen — at both viewports, which
    // is why the Item's SKU is found twice.
    expect(await screen.findAllByText('SKU-SECRET')).toHaveLength(2);
  });
});
