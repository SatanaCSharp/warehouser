import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';

import { ROUTES } from 'shared/constants/routes';
import { makeStore } from 'store';
import { accessIds } from 'test/access-fixtures';

import type { RenderResult } from '@testing-library/react';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type React from 'react';
import type { AppStore } from 'store';

/**
 * Renders `ui` inside a Redux `Provider`, matching the production render
 * tree in main.tsx.
 */
export const renderWithProviders = (
  ui: React.ReactElement,
  store: AppStore = makeStore(),
): RenderResult => {
  return render(<Provider store={store}>{ui}</Provider>);
};

/**
 * T6 / CR-AC-06 — renders `ui` as a descendant of an **entered** Warehouse
 * match, which is what every consumer of `useCurrentPermissions` now needs: the
 * Warehouse a surface operates on is the one its address names, so a bare store
 * no longer carries enough context to render an access surface.
 *
 * The tree is the smallest one that satisfies `useEnteredWarehouse`: a route
 * declared at `ROUTES.WAREHOUSE` — sharing the id the hook targets, without
 * importing the production `warehouseRoute` singleton — whose `beforeLoad`
 * publishes an `entered` verdict for `warehouseId`. Use `renderWithProviders`
 * for a component that reads no Warehouse authority.
 *
 * Pass `verdict` to publish a different entry state — AC-23's archived
 * Warehouse is `{ status: 'entered-read-only', reason: 'archived' }`, which is
 * what makes a destination render its writes as disabled-and-explained rather
 * than absent.
 */
export const renderInEnteredWarehouse = (
  ui: React.ReactElement,
  store: AppStore = makeStore(),
  warehouseId: string = accessIds.warehouse,
  verdict: Omit<WarehouseEntryVerdict, 'warehouseId'> = { status: 'entered' },
): RenderResult => {
  const testRootRoute = createRootRouteWithContext<{ store: AppStore }>()({
    component: () => <Outlet />,
  });
  const warehouseTestRoute = createRoute({
    getParentRoute: () => testRootRoute,
    path: ROUTES.WAREHOUSE,
    beforeLoad: ({ params }): WarehouseEntryVerdict => ({
      ...verdict,
      warehouseId: params.warehouseId,
    }),
  });
  const subjectRoute = createRoute({
    getParentRoute: () => warehouseTestRoute,
    path: '/',
    component: () => ui,
  });

  const router = createRouter({
    routeTree: testRootRoute.addChildren([
      warehouseTestRoute.addChildren([subjectRoute]),
    ]),
    context: { store },
    history: createMemoryHistory({
      initialEntries: [`/warehouses/${warehouseId}`],
    }),
  });

  return render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
};
