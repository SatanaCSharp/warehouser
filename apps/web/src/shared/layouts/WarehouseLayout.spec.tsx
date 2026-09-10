import type { AnyRouter } from '@tanstack/react-router';
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
import { useRecordWarehouseEntry } from 'modules/warehouse/hooks/effects/useRecordWarehouseEntry';
import { Provider } from 'react-redux';
import { ROUTE_SEGMENTS, ROUTES } from 'shared/constants/routes';
import { WarehouseLayout } from 'shared/layouts/WarehouseLayout';
import type { AppStore } from 'store';
import { makeStore } from 'store';
import { describe, expect, it, vi } from 'vitest';

// T4 — `WarehouseLayout` is the Warehouse layout route's own component. It
// reads the entry verdict its own route's `beforeLoad` published (the
// nearest match — no `from` needed, since it is literally that route's
// component), and renders `<Outlet />` only when `entered`.
const WAREHOUSE_ID = '00000000-0000-4000-8000-000000000010';

// T8 / CR-AC-09 — the entry-record hook makes its own network calls, which
// this file's cases have no interest in stubbing. Mocking it here keeps this
// spec about rendering, and lets it assert precisely where the hook mounts.
vi.mock('modules/warehouse/hooks/effects/useRecordWarehouseEntry', () => ({
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

  // CR-AC-07 — this is the change's single entry-enforcement point, so its
  // default must be closed. Branching on `status === 'refused'` admits
  // everything that is merely *not* that string, including a verdict the route
  // never published; the Warehouse view and its CR-AC-09 write would then
  // render on the strength of an absent value.
  it.each([
    ['no verdict at all', undefined],
    ['a verdict of an unrecognized status', { status: 'unknown' }],
    ['a verdict that is not an object', 'entered'],
  ])(
    'refuses rather than entering when beforeLoad publishes %s',
    async (_case, verdict) => {
      vi.mocked(useRecordWarehouseEntry).mockClear();
      renderLayout(verdict as unknown as WarehouseEntryVerdict);

      expect(
        await screen.findByText("This address isn't available to you"),
      ).toBeInTheDocument();
      expect(screen.queryByText('Dashboard content')).not.toBeInTheDocument();
      expect(useRecordWarehouseEntry).not.toHaveBeenCalled();
    },
  );

  it('renders the explicit archived refusal instead of the Outlet for an archived refusal verdict', async () => {
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

  // AC-23 — an archived Warehouse is entered read-only rather than refused, so
  // its destinations paint and their watch reads run exactly as before
  // archiving. This replaces the old behaviour, under which the same membership
  // produced a refusal and made Demand, Purchase Drafts and Items unreachable.
  it('renders the Outlet for a read-only verdict', async () => {
    renderLayout({
      status: 'entered-read-only',
      reason: 'archived',
      warehouseId: WAREHOUSE_ID,
    });

    expect(await screen.findByText('Dashboard content')).toBeInTheDocument();
    expect(
      screen.queryByText('This warehouse is archived'),
    ).not.toBeInTheDocument();
  });

  // CR-AC-17 — the actor's stored selection is unchanged by addressing an
  // archived Warehouse, so the CR-AC-09 entry record must not run under a
  // read-only verdict either.
  it('mounts no entry record under a read-only verdict', async () => {
    vi.mocked(useRecordWarehouseEntry).mockClear();

    renderLayout({
      status: 'entered-read-only',
      reason: 'archived',
      warehouseId: WAREHOUSE_ID,
    });

    await screen.findByText('Dashboard content');
    expect(useRecordWarehouseEntry).not.toHaveBeenCalled();
  });
});

// AC-23 vs CR-AC-17 — AC-23 reopens an archived Warehouse for reading its
// demand, drafts and Items and says nothing about Access, so the Access address
// alone keeps CR-AC-17's explicit archived refusal under a read-only verdict.
describe('WarehouseLayout at the Access destination (CR-AC-17)', () => {
  const renderAccessDestination = (verdict: WarehouseEntryVerdict): void => {
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
    const accessTestRoute = createRoute({
      getParentRoute: () => warehouseTestRoute,
      path: ROUTE_SEGMENTS.ACCESS,
      component: () => <div>Access content</div>,
    });

    const router = createRouter({
      routeTree: testRootRoute.addChildren([
        warehouseTestRoute.addChildren([accessTestRoute]),
      ]),
      context: { store },
      history: createMemoryHistory({
        initialEntries: [`/warehouses/${WAREHOUSE_ID}/access`],
      }),
    });

    render(
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>,
    );
  };

  it('refuses the Access address under a read-only verdict, naming the archived reason', async () => {
    renderAccessDestination({
      status: 'entered-read-only',
      reason: 'archived',
      warehouseId: WAREHOUSE_ID,
    });

    expect(
      await screen.findByText('This warehouse is archived'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Access content')).not.toBeInTheDocument();
  });

  it('admits the Access address for a full entry', async () => {
    renderAccessDestination({ status: 'entered', warehouseId: WAREHOUSE_ID });

    expect(await screen.findByText('Access content')).toBeInTheDocument();
  });
});
