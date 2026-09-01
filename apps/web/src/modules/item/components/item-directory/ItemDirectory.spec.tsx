import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import i18n from 'i18next';
import { Provider } from 'react-redux';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { itemApi } from 'modules/item/api/item-api';
import { ItemDirectory } from 'modules/item/components/item-directory/ItemDirectory';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import { ROUTES } from 'shared/constants/routes';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { Item } from '@warehouser/contracts/items';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type { AppStore } from 'store';

// T18 — the Items destination's list owner, composing `Ordering/Item Row`
// (`xEIH0`, desktop `XIvAZ`) and `Item Card Mobile` (`QSHsy`, mobile `VHU6r`).
// DoD: "Frames XIvAZ (1440) and VHU6r (390) are matched, with focus restored
// on dialog close, en/uk copy at full parity", plus AC-23's read-only entry.
// Colocated with the component it covers (`placing-web-tests.md` §1).
//
// `CreateItemAction` gates the "Add item" trigger on `ITEMS:CREATE`, read
// from the cached current-access projection of the Warehouse the address
// names (`docs/system/adr/19-08-2026-declarative-permission-gates.md`), so
// this directory is rendered as a descendant of an entered Warehouse match —
// `renderInEnteredWarehouse`, exactly as `MembersTab.spec.tsx` renders the
// access surfaces that read the same projection.
//
// The desktop surface is a HeroUI `Table`
// (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`), so React
// Aria owns the `<table>` element and exposes it as a keyboard-navigable
// `grid`; the responsive class belongs to the `.table-root` wrapper this
// destination renders around it. What each row presents is
// `components/ItemTable.spec.tsx`; what the collection around it does is
// `components/ItemCatalogue.spec.tsx`; this file covers the destination.

const items: Item[] = [
  {
    id: '00000000-0000-4000-8000-000000000240',
    sku: 'SKU-100',
    description: 'Corrugated box',
    unitOfMeasure: 'each',
    onHandQuantity: 42,
    deactivatedAt: null,
    namingCustomerOrderCount: 0,
    namingPurchaseDraftLineCount: 0,
    latestAdjustment: {
      countedQuantity: 42,
      reason: 'Cycle count',
      adjustedByUserId: accessIds.actingUser,
      adjustedAt: '2026-08-20T09:00:00.000Z',
    },
    createdAt: '2026-08-01T09:00:00.000Z',
  },
];

const seededStore = (
  permissionIds: readonly PermissionId[],
  directoryItems: Item[] = items,
): AppStore => {
  stubAccessServer({ permissionIds });
  const store = authenticatedStore();
  void store.dispatch(
    itemApi.util.upsertQueryData(
      'listItems',
      accessIds.warehouse,
      directoryItems,
    ),
  );
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
  return store;
};

/**
 * Renders the directory for an actor holding `permissionIds`, with that
 * actor's projection already in the cache `CreateItemAction` and every row
 * read — seeding the cache rather than waiting for a request keeps every
 * case below asserting against resolved markup, exactly as
 * `MemberList.spec.tsx`'s `renderMemberList` does for the same projection.
 */
const renderDirectory = (
  directoryItems: Item[] = items,
  permissionIds: readonly PermissionId[] = Object.values(PermissionId),
): AppStore => {
  const store = seededStore(permissionIds, directoryItems);
  renderInEnteredWarehouse(<ItemDirectory />, store, accessIds.warehouse);
  return store;
};

/**
 * AC-23 — archiving is a property of the ENTRY VERDICT the Warehouse layout
 * route publishes, not of a Permission, and `test/render.tsx` only publishes
 * the `entered` one. So the read-only case builds its own match rather than
 * widening a shared helper other destinations depend on, the same way
 * `useArchivedWarehouse.spec.tsx` does.
 */
const renderInArchivedWarehouse = (): void => {
  const store = seededStore(Object.values(PermissionId));
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
    component: ItemDirectory,
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

describe('ItemDirectory', () => {
  // Every case below stubs `fetch` for the access server, which would 404 a
  // first-ever request for the `uk` `item` namespace. Loading both languages
  // once here, before any test's stub replaces `fetch`, caches them for the
  // rest of this file so the "en/uk parity" case's `changeLanguage('uk')`
  // needs no network at all.
  beforeAll(async () => {
    await i18n.changeLanguage('uk');
    await i18n.changeLanguage('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  // jsdom applies no stylesheet, so the breakpoint behaviour is asserted
  // through the responsive utility classes the approved frames translate to,
  // exactly as `WarehousesTab.spec.tsx`'s responsive suite does.
  describe('responsive behaviour (desktop 1440 / mobile 390)', () => {
    it('renders the table from the split-view breakpoint up (XIvAZ, 1440)', async () => {
      renderDirectory();

      const table = await screen.findByRole('grid', { name: /items/iu });
      // `.table-root` is HeroUI's documented root class for `Table`, and it is
      // the element this destination puts its breakpoint class on.
      expect(table.closest('.table-root')?.className).toContain('lg:block');
    });

    it('renders one labelled card per Item below the breakpoint (VHU6r, 390)', async () => {
      renderDirectory();

      const list = await screen.findByRole('list', { name: /items/iu });
      expect(list.className).toContain('lg:hidden');
      const card = within(list).getByText('SKU-100').closest('li');
      // Every value on the card is labelled or self-describing: the on-hand
      // block names itself, and the meta line names the unit and what
      // references the Item.
      expect(card).toHaveTextContent('On hand');
      expect(card).toHaveTextContent('42');
      expect(card).toHaveTextContent('each');
      expect(card).toHaveTextContent('20 Aug · Cycle count · by you');
      expect(card).toHaveTextContent(
        'Counted in each · nothing names it yet, so its SKU is still correctable',
      );
    });
  });

  it('restores focus to the trigger once the create-item dialog closes', async () => {
    const user = userEvent.setup();
    renderDirectory();

    const trigger = await screen.findByRole('button', { name: /add item/iu });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: /add an item/iu });

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(dialog).not.toBeInTheDocument();
  });

  it('opens the correction dialog for the row it was asked for', async () => {
    const user = userEvent.setup();
    renderDirectory();

    const trigger = (
      await screen.findAllByRole('button', { name: /actions for SKU-100/iu })
    )[0];
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: /correct item/iu }));

    expect(
      await screen.findByRole('dialog', {
        name: 'Correct SKU-100 · Corrugated box',
      }),
    ).toBeVisible();
  });

  it('renders its action in both supported languages (en/uk parity)', async () => {
    renderDirectory();
    expect(
      await screen.findByRole('button', { name: 'Add item' }),
    ).toBeInTheDocument();

    await i18n.changeLanguage('uk');

    expect(
      await screen.findByRole('button', { name: 'Додати товар' }),
    ).toBeInTheDocument();
  });

  // The ADR's actual guarantee: an actor without `ITEMS:CREATE` is offered no
  // "Add item" trigger at all — absent, not disabled.
  it('does not offer "Add item" to an actor lacking ITEMS:CREATE', async () => {
    renderDirectory(items, []);

    // The sibling search field proves the surface mounted and the projection
    // resolved, so the absent trigger below is the gate withholding it.
    await screen.findByRole('searchbox', { name: /search by SKU/iu });
    expect(
      screen.queryByRole('button', { name: /add item/iu }),
    ).not.toBeInTheDocument();
  });

  // AC-23 — an archived Warehouse is entered READ-ONLY rather than refused, so
  // every mutating control stays on screen and is disabled with its reason
  // exposed. A vanished control would leave a member unable to understand why
  // the site they belong to no longer accepts work.
  describe('an archived Warehouse (AC-23)', () => {
    it('keeps "Add item" visible and disabled, pointing at the stated reason', async () => {
      renderInArchivedWarehouse();

      const trigger = await screen.findByRole('button', {
        name: /add item/iu,
      });
      expect(trigger).toBeVisible();
      expect(trigger).toBeDisabled();
      // The *reference* is all this level can prove: the sentence it names is
      // rendered by `ArchivedWarehouseNotice` on the page above, so within this
      // DOM the id necessarily resolves to nothing. That the reference actually
      // lands on a rendered element is proved where both are mounted, in
      // `modules/item/page.spec.tsx`.
      expect(trigger).toHaveAttribute(
        'aria-describedby',
        'archived-warehouse-reason',
      );
    });

    it('keeps every row action listed and disabled rather than withholding the menu', async () => {
      const user = userEvent.setup();
      renderInArchivedWarehouse();

      const trigger = (
        await screen.findAllByRole('button', { name: /actions for SKU-100/iu })
      )[0];
      await user.click(trigger);

      const menu = screen.getByRole('menu', { name: /actions for/iu });
      const correct = within(menu).getByRole('menuitem', {
        name: /correct item/iu,
      });
      expect(correct).toBeVisible();
      expect(correct).toHaveAttribute('aria-disabled', 'true');
      // The description belongs on the item, not on the menu around it: a
      // disabled `menuitem` keeps focus, and its description is announced each
      // time it takes it. Resolution, again, is proved in `page.spec.tsx`.
      expect(correct).toHaveAttribute(
        'aria-describedby',
        expect.stringContaining('archived-warehouse-reason'),
      );
    });
  });
});
