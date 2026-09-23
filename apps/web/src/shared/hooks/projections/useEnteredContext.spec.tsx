import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import { workspaceDashboardRoute } from 'modules/workspace/dashboard/route';
import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { createAppRouter } from 'router';
import { ROUTES } from 'shared/constants/routes';
import { useEnteredContext } from 'shared/hooks/projections/useEnteredContext';
import type { AppStore } from 'store';
import { makeStore } from 'store';
import { describe, expect, it } from 'vitest';

// T10, T11 — the shell's single context predicate, read from the MATCHED ROUTE
// TREE. `Sidebar`, `RootLayout`'s drawer toggle and `RetainedContextMessage` all
// read it, so what it answers per address is asserted here once rather than
// three times over three consumers.
//
// The tree below mirrors the production shape that matters to the predicate:
// `/workspace` and `/workspace/dashboard` are FLAT root siblings, not a branch,
// because the Dashboard declares `rootRoute` as its parent so it inherits no
// capability guard (dashboards AC-15). A predicate matching only `/workspace`
// therefore answers `none` at the Dashboard address, which withdrew the whole
// rail from it.
const MEMBER_WAREHOUSE_ID = '00000000-0000-4000-8000-000000000010';

const Probe = (): ReactElement => {
  const enteredContext = useEnteredContext();
  return <div data-testid="probe">{enteredContext.kind}</div>;
};

const renderProbeAt = (
  initialEntry: string,
  verdict?: WarehouseEntryVerdict,
): void => {
  const store = makeStore();
  const testRootRoute = createRootRouteWithContext<{ store: AppStore }>()({
    // The predicate's consumers are shell chrome rendered by the ROOT route, an
    // ancestor of every match it reads, so the probe is read from there too.
    component: () => (
      <>
        <Probe />
        <Outlet />
      </>
    ),
  });
  const homeRoute = createRoute({
    getParentRoute: () => testRootRoute,
    path: ROUTES.HOME,
    component: () => null,
  });
  const workspaceRoute = createRoute({
    getParentRoute: () => testRootRoute,
    path: ROUTES.WORKSPACE,
    component: () => null,
  });
  const workspaceDashboardTestRoute = createRoute({
    getParentRoute: () => testRootRoute,
    path: ROUTES.WORKSPACE_DASHBOARD,
    component: () => null,
  });
  const warehouseTestRoute = createRoute({
    getParentRoute: () => testRootRoute,
    path: ROUTES.WAREHOUSE,
    beforeLoad: (): WarehouseEntryVerdict => verdict!,
  });
  const warehouseIndexRoute = createRoute({
    getParentRoute: () => warehouseTestRoute,
    path: '/',
    component: () => null,
  });
  const router = createRouter({
    routeTree: testRootRoute.addChildren([
      homeRoute,
      workspaceRoute,
      workspaceDashboardTestRoute,
      warehouseTestRoute.addChildren([warehouseIndexRoute]),
    ]),
    context: { store },
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
};

describe('useEnteredContext', () => {
  it('reads no context at the application root', async () => {
    renderProbeAt(ROUTES.HOME);

    expect(await screen.findByTestId('probe')).toHaveTextContent('none');
  });

  it('reads a workspace context at the administration address', async () => {
    renderProbeAt(ROUTES.WORKSPACE);

    expect(await screen.findByTestId('probe')).toHaveTextContent('workspace');
  });

  // dashboards T19 — the defect this case exists for. The Workspace Dashboard is
  // a flat root child, so nothing about it matches `/workspace`; reading only
  // that id answered `none` here, which withdrew the Workspace rail, the drawer
  // toggle and nothing else's suppression — leaving no way off the surface.
  it('reads a workspace context at the Workspace Dashboard address', async () => {
    renderProbeAt(ROUTES.WORKSPACE_DASHBOARD);

    expect(await screen.findByTestId('probe')).toHaveTextContent('workspace');
  });

  it('reads a warehouse context inside an entered Warehouse', async () => {
    renderProbeAt(`/warehouses/${MEMBER_WAREHOUSE_ID}`, {
      status: 'entered',
      warehouseId: MEMBER_WAREHOUSE_ID,
    });

    expect(await screen.findByTestId('probe')).toHaveTextContent('warehouse');
  });

  // CR-AC-07 — a refusal renders AT a Warehouse address but is not a Warehouse
  // view, which is why the predicate reads the verdict rather than the pathname.
  it('reads no context around a Warehouse entry refusal', async () => {
    renderProbeAt(`/warehouses/${MEMBER_WAREHOUSE_ID}`, {
      status: 'refused',
      reason: 'not-a-member',
      warehouseId: MEMBER_WAREHOUSE_ID,
    });

    expect(await screen.findByTestId('probe')).toHaveTextContent('none');
  });

  // The ids the predicate matches on are derived by TanStack when a router
  // builds its tree, not declared in the route files. If either derivation ever
  // stops equalling its `ROUTES` constant the predicate would silently answer
  // `none` rather than fail loudly, so the production tree's own ids are pinned
  // here — `useEnteredWarehouse.spec.tsx` pins `ROUTES.WAREHOUSE` the same way.
  it('matches the route ids the production tree derives for both Workspace addresses', () => {
    const router = createAppRouter({ initialEntries: [ROUTES.WORKSPACE] });
    const routeIds = Object.values(router.routesById).map((route) => route.id);

    expect(workspaceDashboardRoute.id).toBe(ROUTES.WORKSPACE_DASHBOARD);
    expect(routeIds).toContain(ROUTES.WORKSPACE);
    expect(routeIds).toContain(ROUTES.WORKSPACE_DASHBOARD);
  });
});
