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
import { describe, expect, it, vi } from 'vitest';

import { useRecordWarehouseEntry } from 'modules/warehouse/hooks/useRecordWarehouseEntry';
import { ROUTES } from 'shared/constants/routes';
import { WarehouseLayout } from 'shared/layouts/WarehouseLayout';
import { makeStore } from 'store';

import type { AnyRouter } from '@tanstack/react-router';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type { AppStore } from 'store';

// T4 — `WarehouseLayout` is the Warehouse layout route's own component. It
// reads the entry verdict its own route's `beforeLoad` published (the
// nearest match — no `from` needed, since it is literally that route's
// component), and renders `<Outlet />` only when `entered`.
const WAREHOUSE_ID = '00000000-0000-4000-8000-000000000010';

// T8 / CR-AC-09 — the entry-record hook makes its own network calls, which
// this file's cases have no interest in stubbing. Mocking it here keeps this
// spec about rendering, and lets it assert precisely where the hook mounts.
vi.mock('modules/warehouse/hooks/useRecordWarehouseEntry', () => ({
  useRecordWarehouseEntry: vi.fn(),
}));

const buildLayoutRouter = (
  verdict: WarehouseEntryVerdict,
): { router: AnyRouter; store: AppStore } => {
  const store = makeStore();
  const testRootRoute = createRootRouteWithContext<{ store: AppStore }>()({
    component: () => <Outlet />,
  });
  const warehouseTestRoute = createRoute({
    getParentRoute: () => testRootRoute,
    path: ROUTES.WAREHOUSE,
    beforeLoad: (): WarehouseEntryVerdict => verdict,
    component: WarehouseLayout,
  });
  const dashboardTestRoute = createRoute({
    getParentRoute: () => warehouseTestRoute,
    path: '/',
    component: () => <div>Dashboard content</div>,
  });

  const routeTree = testRootRoute.addChildren([
    warehouseTestRoute.addChildren([dashboardTestRoute]),
  ]);

  const router = createRouter({
    routeTree,
    context: { store },
    history: createMemoryHistory({
      initialEntries: [`/warehouses/${WAREHOUSE_ID}`],
    }),
  });

  return { router, store };
};

const renderLayout = (verdict: WarehouseEntryVerdict): void => {
  const { router, store } = buildLayoutRouter(verdict);
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
};

describe('WarehouseLayout', () => {
  it('renders the Outlet for an entered verdict', async () => {
    renderLayout({ status: 'entered', warehouseId: WAREHOUSE_ID });

    expect(await screen.findByText('Dashboard content')).toBeInTheDocument();
  });

  // T8 / CR-AC-09 — the entry-record write must never run around a refusal;
  // it is mounted only in the branch that renders the Outlet.
  it('mounts useRecordWarehouseEntry for an entered verdict and not around a refusal', async () => {
    vi.mocked(useRecordWarehouseEntry).mockClear();
    renderLayout({
      status: 'refused',
      reason: 'not-a-member',
      warehouseId: WAREHOUSE_ID,
    });
    await screen.findByText("This address isn't available to you");
    expect(useRecordWarehouseEntry).not.toHaveBeenCalled();

    vi.mocked(useRecordWarehouseEntry).mockClear();
    renderLayout({ status: 'entered', warehouseId: WAREHOUSE_ID });
    await screen.findByText('Dashboard content');
    expect(useRecordWarehouseEntry).toHaveBeenCalled();
  });

  it('renders the non-disclosing refusal instead of the Outlet for a non-member verdict', async () => {
    renderLayout({
      status: 'refused',
      reason: 'not-a-member',
      warehouseId: WAREHOUSE_ID,
    });

    expect(
      await screen.findByText("This address isn't available to you"),
    ).toBeInTheDocument();
    expect(screen.queryByText('Dashboard content')).not.toBeInTheDocument();
  });

  it('renders the explicit archived refusal instead of the Outlet for an archived verdict', async () => {
    renderLayout({
      status: 'refused',
      reason: 'archived',
      warehouseId: WAREHOUSE_ID,
    });

    expect(
      await screen.findByText('This warehouse is archived'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Dashboard content')).not.toBeInTheDocument();
  });
});
