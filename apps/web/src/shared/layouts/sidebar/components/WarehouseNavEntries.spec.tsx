import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import type { AccessProjection } from '@warehouser/contracts/access';
import { PermissionId } from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { ROUTES } from 'shared/constants/routes';
import { SidebarNavList } from 'shared/layouts/sidebar/components/SidebarNavList';
import { WarehouseNavEntries } from 'shared/layouts/sidebar/components/WarehouseNavEntries';
import type { AppStore } from 'store';
import { makeStore } from 'store';
import { accessIds } from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The Warehouse view's entry set. `Sidebar` selects it from the entered
// context; what this file owns is which entries that set contains, what admits
// each, and the fact that it reads the entered Warehouse and its archived state
// for ITSELF rather than being handed either as a prop.

const baseAccess: AccessProjection = {
  warehouseId: accessIds.warehouse,
  roleId: accessIds.pickerRole,
  roleKind: 'custom',
  permissionIds: [],
  archivedAt: null,
};

const stubAccess = (permissionIds: PermissionId[]): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      return url.includes('/access/current')
        ? Promise.resolve(Response.json({ ...baseAccess, permissionIds }))
        : Promise.resolve(Response.json({}, { status: 404 }));
    }),
  );
};

const renderEntries = (
  verdict: Parameters<typeof renderInEnteredWarehouse>[3] = {
    status: 'entered',
  },
): void => {
  renderInEnteredWarehouse(
    <SidebarNavList isCollapsed={false}>
      <WarehouseNavEntries isCollapsed={false} />
    </SidebarNavList>,
    makeStore(),
    accessIds.warehouse,
    verdict,
  );
};

describe('WarehouseNavEntries', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('addresses every entry within the Warehouse it reads from the route', async () => {
    stubAccess([PermissionId.ITEMS_WATCH]);
    renderEntries();

    expect(await screen.findByRole('link', { name: 'Items' })).toHaveAttribute(
      'href',
      `/warehouses/${accessIds.warehouse}/items`,
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      `/warehouses/${accessIds.warehouse}`,
    );
  });

  // The gate is an element at the entry it protects, so a missing Permission
  // makes the entry ABSENT — not disabled, not an empty placeholder.
  it('omits a gated entry the actor holds no watch Permission for', async () => {
    stubAccess([]);
    renderEntries();

    await screen.findByRole('link', { name: 'Dashboard' });
    expect(
      screen.queryByRole('link', { name: 'Items' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Items')).not.toBeInTheDocument();
  });

  // AC-23 vs CR-AC-13 / CR-AC-17 — the archived state is read here, from the
  // entry verdict, not handed down: an archived Warehouse keeps its watch
  // destinations and drops Access, which still refuses its own address.
  it('reads the archived state itself and drops Access for it', async () => {
    stubAccess([PermissionId.ITEMS_WATCH, PermissionId.ROLES_WATCH]);
    renderEntries({ status: 'entered-read-only', reason: 'archived' });

    expect(
      await screen.findByRole('link', { name: 'Items' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: 'Access' }),
      ).not.toBeInTheDocument(),
    );
  });

  // It is selected by the entered context, so it must contribute nothing when
  // it is rendered anywhere else — otherwise `Sidebar`'s selection would be the
  // only thing keeping a Warehouse-addressed entry out of another view.
  it('contributes no entry outside a Warehouse view', async () => {
    stubAccess([PermissionId.ITEMS_WATCH]);
    const store = makeStore();
    const rootRoute = createRootRouteWithContext<{ store: AppStore }>()({
      component: () => (
        <SidebarNavList isCollapsed={false}>
          <WarehouseNavEntries isCollapsed={false} />
        </SidebarNavList>
      ),
    });
    const homeRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: ROUTES.HOME,
      component: () => null,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([homeRoute]),
      context: { store },
      history: createMemoryHistory({ initialEntries: [ROUTES.HOME] }),
    });

    render(
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>,
    );

    await waitFor(() => expect(screen.getByRole('list')).toBeInTheDocument());
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
