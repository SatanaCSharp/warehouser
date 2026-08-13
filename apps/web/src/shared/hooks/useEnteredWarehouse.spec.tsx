import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import { ROUTES } from 'shared/constants/routes';
import { useEnteredWarehouse } from 'shared/hooks/useEnteredWarehouse';
import { makeStore } from 'store';

import type { AnyRouter } from '@tanstack/react-router';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type { ReactElement } from 'react';
import type { AppStore } from 'store';

// T4 — `useEnteredWarehouse` is the single non-throwing reader of the entry
// verdict `guards/warehouse-entry.guard.ts` publishes into the Warehouse
// layout match's context. This suite builds its own tiny route tree instead
// of the production one: it only needs a route whose id equals
// `ROUTES.WAREHOUSE` (the same id the hook targets via `from`), so the
// production `warehouseRoute` singleton is never imported or mutated here.
const MEMBER_WAREHOUSE_ID = '00000000-0000-4000-8000-000000000010';

const Probe = (): ReactElement => {
  const warehouseId = useEnteredWarehouse();
  return <div data-testid="probe">{warehouseId ?? 'none'}</div>;
};

/** The same read, rendered above the Warehouse match rather than beneath it. */
const AncestorProbe = (): ReactElement => {
  const warehouseId = useEnteredWarehouse();
  return <div data-testid="ancestor-probe">{warehouseId ?? 'none'}</div>;
};

const buildProbeRouter = (
  initialEntry: string,
  verdict?: WarehouseEntryVerdict,
  rootComponent: () => ReactElement = () => <Outlet />,
): { router: AnyRouter; store: AppStore } => {
  const store = makeStore();
  const testRootRoute = createRootRouteWithContext<{ store: AppStore }>()({
    component: rootComponent,
  });
  const rootProbeRoute = createRoute({
    getParentRoute: () => testRootRoute,
    path: ROUTES.HOME,
    component: Probe,
  });
  const workspaceProbeRoute = createRoute({
    getParentRoute: () => testRootRoute,
    path: ROUTES.WORKSPACE,
    component: Probe,
  });
  const warehouseTestRoute = createRoute({
    getParentRoute: () => testRootRoute,
    path: ROUTES.WAREHOUSE,
    beforeLoad: (): WarehouseEntryVerdict => verdict!,
  });
  // The probe is a CHILD of the Warehouse route, not the route itself, so
  // this pins that a descendant reads the entry verdict through the
  // published match context rather than its own match.
  const warehouseChildProbeRoute = createRoute({
    getParentRoute: () => warehouseTestRoute,
    path: '/',
    component: Probe,
  });

  const routeTree = testRootRoute.addChildren([
    rootProbeRoute,
    workspaceProbeRoute,
    warehouseTestRoute.addChildren([warehouseChildProbeRoute]),
  ]);

  const router = createRouter({
    routeTree,
    context: { store },
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });

  return { router, store };
};

const renderProbe = (
  initialEntry: string,
  verdict?: WarehouseEntryVerdict,
  rootComponent?: () => ReactElement,
): void => {
  const { router, store } = buildProbeRouter(
    initialEntry,
    verdict,
    rootComponent,
  );
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
};

describe('useEnteredWarehouse', () => {
  it('returns undefined at the root, outside any Warehouse match', async () => {
    renderProbe(ROUTES.HOME);

    expect(await screen.findByTestId('probe')).toHaveTextContent('none');
  });

  it('returns undefined in the Workspace view', async () => {
    renderProbe(ROUTES.WORKSPACE);

    expect(await screen.findByTestId('probe')).toHaveTextContent('none');
  });

  it('returns the id for an entered verdict, read from a descendant match', async () => {
    renderProbe(`/warehouses/${MEMBER_WAREHOUSE_ID}`, {
      status: 'entered',
      warehouseId: MEMBER_WAREHOUSE_ID,
    });

    expect(await screen.findByTestId('probe')).toHaveTextContent(
      MEMBER_WAREHOUSE_ID,
    );
  });

  it('returns undefined around a non-member refusal', async () => {
    renderProbe(`/warehouses/${MEMBER_WAREHOUSE_ID}`, {
      status: 'refused',
      reason: 'not-a-member',
      warehouseId: MEMBER_WAREHOUSE_ID,
    });

    expect(await screen.findByTestId('probe')).toHaveTextContent('none');
  });

  it('returns undefined around an archived refusal', async () => {
    renderProbe(`/warehouses/${MEMBER_WAREHOUSE_ID}`, {
      status: 'refused',
      reason: 'archived',
      warehouseId: MEMBER_WAREHOUSE_ID,
    });

    expect(await screen.findByTestId('probe')).toHaveTextContent('none');
  });

  // T6 / CR-AC-11 — the shell chrome that must follow the entered context
  // (`Sidebar`) is rendered by the ROOT route, an *ancestor* of the Warehouse
  // match. A nearest-match read can only ever see the caller's own match and
  // its ancestors, so it would answer `undefined` here and the Warehouse-view
  // navigation could never be addressed. This pins the position-independent
  // read the hook relies on.
  it('returns the id when read from an ancestor of the Warehouse match', async () => {
    renderProbe(
      `/warehouses/${MEMBER_WAREHOUSE_ID}`,
      { status: 'entered', warehouseId: MEMBER_WAREHOUSE_ID },
      () => (
        <>
          <AncestorProbe />
          <Outlet />
        </>
      ),
    );

    expect(await screen.findByTestId('ancestor-probe')).toHaveTextContent(
      MEMBER_WAREHOUSE_ID,
    );
  });

  // The id the hook matches on is the one TanStack derives for the Warehouse
  // layout route. If that derivation ever stops equalling `ROUTES.WAREHOUSE`,
  // every reader above would silently answer `undefined` rather than fail
  // loudly, so it is pinned here directly.
  it('matches the route id TanStack derives for the Warehouse layout route', async () => {
    const { router } = buildProbeRouter(`/warehouses/${MEMBER_WAREHOUSE_ID}`, {
      status: 'entered',
      warehouseId: MEMBER_WAREHOUSE_ID,
    });
    await router.load();

    expect(
      router.state.matches.map((match: { routeId: string }) => match.routeId),
    ).toContain(ROUTES.WAREHOUSE);
  });
});
