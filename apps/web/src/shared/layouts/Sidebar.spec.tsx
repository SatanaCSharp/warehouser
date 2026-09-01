import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PermissionId,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ROUTES, ROUTE_SEGMENTS } from 'shared/constants/routes';
import { Sidebar } from 'shared/layouts/Sidebar';
import { makeStore } from 'store';
import { namedWorkspaceContext } from 'test/workspace-fixtures';

import type { AnyRouter } from '@tanstack/react-router';
import type { AccessProjection } from '@warehouser/contracts/access';
import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type { ReactElement } from 'react';
import type { AppStore } from 'store';

const WAREHOUSE_ONE = '00000000-0000-4000-8000-000000000010';
const WAREHOUSE_TWO = '00000000-0000-4000-8000-000000000012';

const baseAccess: AccessProjection = {
  warehouseId: WAREHOUSE_ONE,
  roleId: '00000000-0000-4000-8000-000000000011',
  roleKind: 'custom',
  permissionIds: [],
  archivedAt: null,
};

const warehouseAddress = (warehouseId: string): string =>
  `/warehouses/${warehouseId}`;
const accessAddress = (warehouseId: string): string =>
  `${warehouseAddress(warehouseId)}/${ROUTE_SEGMENTS.ACCESS}`;
const currentAccessUrl = (warehouseId: string): string =>
  `/api/v1/warehouses/${warehouseId}/access/current`;

// T6 / CR-AC-11 — the Access entry is gated by the projection of the Warehouse
// the sidebar is rendered inside, so these cases answer that Warehouse's own
// `access/current` and nothing else.
const stubAccess = (access: AccessProjection | null): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('/api/v1/workspace/context')) {
        return Promise.resolve(
          Response.json({
            workspace: {
              id: '00000000-0000-4000-8000-000000000020',
              name: 'Acme Logistics',
            },
            workspacePermissionIds: [],
            warehouses: [],
            effectiveWarehouseId: null,
          }),
        );
      }
      return access
        ? Promise.resolve(Response.json(access))
        : new Promise<Response>(() => {});
    }),
  );
};

// The Sidebar's Workspace entry reads a different projection
// (`/api/v1/workspace/context`) than its Access entry
// (`/api/v1/warehouses/:id/access/current`), so each Workspace-focused case
// must answer both requests: Access permissionless so only the Workspace
// assertions are under test, and the Workspace context carrying the
// permissions the case names.
const stubAccessAndWorkspace = (
  workspaceContext: WorkspaceContext | null,
): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('/access/current')) {
        return Promise.resolve(
          Response.json({ ...baseAccess, permissionIds: [] }),
        );
      }
      if (url.includes('/api/v1/workspace/context')) {
        return workspaceContext
          ? Promise.resolve(Response.json(workspaceContext))
          : new Promise<Response>(() => {});
      }
      return Promise.resolve(Response.json({}, { status: 404 }));
    }),
  );
};

type TestContext = { store: AppStore };

const SidebarWithToggle = (): ReactElement => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open navigation</button>
      <Sidebar isOpen={isOpen} onOpenChange={setIsOpen} />
    </>
  );
};

type RenderOptions = {
  component?: () => ReactElement | null;
  entry?: string;
  store?: AppStore;
  /** The entry verdict the Warehouse layout publishes for the address. */
  verdict?: WarehouseEntryVerdict['status'];
};

// T10 / CR-AC-11, CR-AC-12, CR-AC-18 — the sidebar selects its list from the
// MATCHED ROUTE TREE, never from the pathname, so its cases render inside a
// real match: the Warehouse route (entered or refused), the Workspace route, or
// the root. The Warehouse route here shares `ROUTES.WAREHOUSE` as its id — the
// id `useEnteredWarehouse` targets — without importing the production
// `warehouseRoute` singleton.
const renderSidebar = ({
  component = Sidebar,
  entry = warehouseAddress(WAREHOUSE_ONE),
  store = makeStore(),
  verdict = 'entered',
}: RenderOptions = {}): { router: AnyRouter } => {
  const rootRoute = createRootRouteWithContext<TestContext>()({ component });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.HOME,
    component: () => null,
  });
  const workspaceRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.WORKSPACE,
    component: () => null,
  });
  const verdictsByStatus: Record<
    WarehouseEntryVerdict['status'],
    (warehouseId: string) => WarehouseEntryVerdict
  > = {
    entered: (warehouseId) => ({ status: 'entered', warehouseId }),
    'entered-read-only': (warehouseId) => ({
      status: 'entered-read-only',
      reason: 'archived',
      warehouseId,
    }),
    refused: (warehouseId) => ({
      status: 'refused',
      reason: 'not-a-member',
      warehouseId,
    }),
  };
  const warehouseTestRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.WAREHOUSE,
    beforeLoad: ({ params }): WarehouseEntryVerdict =>
      verdictsByStatus[verdict](params.warehouseId),
  });
  const warehouseIndexRoute = createRoute({
    getParentRoute: () => warehouseTestRoute,
    path: '/',
    component: () => null,
  });
  const accessRoute = createRoute({
    getParentRoute: () => warehouseTestRoute,
    path: ROUTE_SEGMENTS.ACCESS,
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      homeRoute,
      workspaceRoute,
      warehouseTestRoute.addChildren([warehouseIndexRoute, accessRoute]),
    ]),
    context: { store },
    history: createMemoryHistory({ initialEntries: [entry] }),
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );

  return { router };
};

describe('Sidebar in a Warehouse view (CR-AC-11)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('addresses Dashboard within the entered Warehouse, not the application root', async () => {
    stubAccess({ ...baseAccess, permissionIds: [] });
    renderSidebar();

    expect(
      await screen.findByRole('link', { name: 'Dashboard' }),
    ).toHaveAttribute('href', warehouseAddress(WAREHOUSE_ONE));
  });

  it.each([
    ['ROLES_WATCH', PermissionId.ROLES_WATCH],
    ['USERS_WATCH', PermissionId.USERS_WATCH],
  ])(
    'addresses Access within the entered Warehouse when the actor holds %s there',
    async (_label, permission) => {
      stubAccess({ ...baseAccess, permissionIds: [permission] });
      renderSidebar();

      expect(
        await screen.findByRole('link', { name: 'Access' }),
      ).toHaveAttribute('href', accessAddress(WAREHOUSE_ONE));
    },
  );

  it('hides Access when the actor holds neither ROLES_WATCH nor USERS_WATCH', async () => {
    stubAccess({ ...baseAccess, permissionIds: [] });
    renderSidebar();

    await screen.findByRole('link', { name: 'Dashboard' });
    expect(
      screen.queryByRole('link', { name: 'Access' }),
    ).not.toBeInTheDocument();
  });

  it('hides Access during the loading window without rendering a skeleton', async () => {
    stubAccess(null);
    renderSidebar();

    expect(
      await screen.findByRole('link', { name: 'Dashboard' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Access' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/loading/iu)).not.toBeInTheDocument();
  });

  // CR-AC-11 — "no Workspace destination appears in it". The actor holds every
  // Workspace administration Permission, so its absence is the context
  // selection at work rather than the gate.
  it('never shows a Workspace destination, even for a Workspace administrator', async () => {
    stubAccessAndWorkspace(
      namedWorkspaceContext([WorkspacePermissionId.WAREHOUSES_WATCH]),
    );
    renderSidebar();

    await screen.findByRole('link', { name: 'Dashboard' });
    expect(
      screen.queryByRole('link', { name: 'Workspace' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
  });

  it('renders an icon for each nav item', async () => {
    stubAccess({ ...baseAccess, permissionIds: [PermissionId.ROLES_WATCH] });
    renderSidebar();

    const dashboardLink = await screen.findByRole('link', {
      name: 'Dashboard',
    });
    const accessLink = await screen.findByRole('link', { name: 'Access' });
    expect(dashboardLink.querySelector('svg')).toBeInTheDocument();
    expect(accessLink.querySelector('svg')).toBeInTheDocument();
  });

  it('tints the nav item matching the current route as active', async () => {
    stubAccess({ ...baseAccess, permissionIds: [PermissionId.ROLES_WATCH] });
    renderSidebar({ entry: accessAddress(WAREHOUSE_ONE) });

    const dashboardLink = await screen.findByRole('link', {
      name: 'Dashboard',
    });
    const accessLink = await screen.findByRole('link', { name: 'Access' });
    expect(accessLink.className).toContain('bg-accent-soft');
    expect(dashboardLink.className).not.toContain('bg-accent-soft');
  });
});

// CR-AC-19 — during a W1 → W2 switch the Access entry follows the shipped
// falsy/loading predicate verbatim: absent while W2's projection is
// unresolved, present once it arrives. Showing W1's answer for W2 would be
// exactly the cross-Warehouse leak CH-04 exists to remove.
// T17 — the ordering web shell's three nav entries (design-handoff.md
// §Information architecture, sad.md §5 Web): `Demand`, `Purchase drafts` and
// `Items` join `Dashboard` and `Access` in `warehouseNavList`, each wrapped in
// its own `WarehousePermissionGate` so a missing watch Permission makes the
// entry absent — the same rule already proven above for `Access` (AC-05,
// AC-22). None of the three exist in `Sidebar.tsx` yet, so every entry query
// below fails to find them regardless of the permission granted.
describe('Sidebar ordering entries (T17, AC-05, AC-22, AC-23)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const orderingNavEntries: [label: string, permission: PermissionId][] = [
    ['Demand', PermissionId.CUSTOMER_ORDERS_WATCH],
    ['Purchase drafts', PermissionId.PURCHASE_DRAFTS_WATCH],
    ['Items', PermissionId.ITEMS_WATCH],
  ];

  it.each(orderingNavEntries)(
    'offers the %s entry when the actor holds its watch Permission',
    async (label, permission) => {
      stubAccess({ ...baseAccess, permissionIds: [permission] });
      renderSidebar();

      expect(
        await screen.findByRole('link', { name: label }),
      ).toBeInTheDocument();
    },
  );

  // AC-05, AC-22 — absent, not disabled and not an empty state, matching the
  // rule already proven for Access above.
  it.each(orderingNavEntries)(
    'omits the %s entry — not disabled, not empty — when the actor holds none of the three watch Permissions',
    async (label) => {
      stubAccess({ ...baseAccess, permissionIds: [] });
      renderSidebar();

      await screen.findByRole('link', { name: 'Dashboard' });
      expect(
        screen.queryByRole('link', { name: label }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: label }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    },
  );

  it('offers only the entries whose watch Permission the actor holds, omitting the other two', async () => {
    stubAccess({
      ...baseAccess,
      permissionIds: [PermissionId.PURCHASE_DRAFTS_WATCH],
    });
    renderSidebar();

    expect(
      await screen.findByRole('link', { name: 'Purchase drafts' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Demand' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Items' }),
    ).not.toBeInTheDocument();
  });

  // AC-23 — an archived Warehouse renders its watch destinations exactly as
  // before archiving: the entry is a function of the held watch Permission
  // alone, never of `archivedAt`.
  it.each(orderingNavEntries)(
    'still offers the %s entry in an archived Warehouse when the actor holds its watch Permission (AC-23)',
    async (label, permission) => {
      stubAccess({
        ...baseAccess,
        permissionIds: [permission],
        archivedAt: '2026-08-13T00:00:00.000Z',
      });
      renderSidebar();

      expect(
        await screen.findByRole('link', { name: label }),
      ).toBeInTheDocument();
    },
  );

  // AC-23's other half — a member without the watch Permission stays refused
  // exactly as before archiving.
  it('still omits an ordering entry in an archived Warehouse when the actor holds no matching watch Permission (AC-23)', async () => {
    stubAccess({
      ...baseAccess,
      permissionIds: [],
      archivedAt: '2026-08-13T00:00:00.000Z',
    });
    renderSidebar();

    await screen.findByRole('link', { name: 'Dashboard' });
    expect(
      screen.queryByRole('link', { name: 'Demand' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Purchase drafts' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Items' }),
    ).not.toBeInTheDocument();
  });
});

// The approved frame `yGhkK` draws the Warehouse list as Dashboard → Demand →
// Purchase drafts → Items → Access, and design-handoff.md §Information
// architecture states the same order. It is asserted as document order rather
// than as five presence checks, because the ordering is the thing that was
// wrong.
describe('Sidebar entry order (frame yGhkK)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the Warehouse destinations in the approved order', async () => {
    stubAccess({
      ...baseAccess,
      permissionIds: [
        PermissionId.CUSTOMER_ORDERS_WATCH,
        PermissionId.PURCHASE_DRAFTS_WATCH,
        PermissionId.ITEMS_WATCH,
        PermissionId.ROLES_WATCH,
      ],
    });
    renderSidebar();

    await screen.findByRole('link', { name: 'Access' });
    const list = screen.getAllByRole('list')[0];

    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Dashboard', 'Demand', 'Purchase drafts', 'Items', 'Access']);
  });
});

// AC-23 vs CR-AC-13 / CR-AC-17 — AC-23 reopens the three watch destinations in
// an archived Warehouse; an archived Warehouse is still not administered, and
// `WarehouseLayout` still refuses its Access address, so the Access entry is
// hidden rather than offered as a link to a refusal.
describe('Sidebar in an archived Warehouse (AC-23, CR-AC-17)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the watch destinations and drops the Access entry', async () => {
    stubAccess({
      ...baseAccess,
      permissionIds: [PermissionId.ITEMS_WATCH, PermissionId.ROLES_WATCH],
    });
    renderSidebar({ verdict: 'entered-read-only' });

    expect(
      await screen.findByRole('link', { name: 'Items' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Access' }),
    ).not.toBeInTheDocument();
  });
});

describe('Sidebar during a context switch (CR-AC-19)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drops the Access entry while the new Warehouse projection is unresolved, then restores it', async () => {
    let resolveSecond: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url === currentAccessUrl(WAREHOUSE_ONE)) {
          return Promise.resolve(
            Response.json({
              ...baseAccess,
              permissionIds: [PermissionId.ROLES_WATCH],
            }),
          );
        }
        if (url === currentAccessUrl(WAREHOUSE_TWO)) {
          return new Promise<Response>((resolve) => {
            resolveSecond = resolve;
          });
        }
        return Promise.resolve(Response.json({}, { status: 404 }));
      }),
    );

    const { router } = renderSidebar();
    await screen.findByRole('link', { name: 'Access' });

    await act(async () => {
      await router.navigate({
        to: ROUTES.WAREHOUSE,
        params: { warehouseId: WAREHOUSE_TWO },
      });
    });

    // W2's projection has not arrived: no entry, no skeleton, and crucially no
    // entry still addressed to W1.
    expect(
      screen.queryByRole('link', { name: 'Access' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/loading/iu)).not.toBeInTheDocument();

    await act(async () => {
      resolveSecond?.(
        Response.json({
          ...baseAccess,
          warehouseId: WAREHOUSE_TWO,
          permissionIds: [PermissionId.USERS_WATCH],
        }),
      );
      await Promise.resolve();
    });

    expect(await screen.findByRole('link', { name: 'Access' })).toHaveAttribute(
      'href',
      accessAddress(WAREHOUSE_TWO),
    );
  });
});

describe('Sidebar in the Workspace view (CR-AC-12)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // AC-30: each single Workspace Permission independently admits the entry,
  // because the destination gates each of its parts separately.
  it.each([
    ['WAREHOUSES:WATCH', WorkspacePermissionId.WAREHOUSES_WATCH],
    ['WORKSPACE_ROLES:WATCH', WorkspacePermissionId.WORKSPACE_ROLES_WATCH],
    ['WORKSPACE_MEMBERS:WATCH', WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH],
    ['WORKSPACE:RENAME', WorkspacePermissionId.WORKSPACE_RENAME],
  ])('shows Workspace when the actor holds %s', async (_label, permission) => {
    stubAccessAndWorkspace(namedWorkspaceContext([permission]));
    renderSidebar({ entry: ROUTES.WORKSPACE });

    expect(
      await screen.findByRole('link', { name: 'Workspace' }),
    ).toHaveAttribute('href', ROUTES.WORKSPACE);
  });

  // CR-AC-12 — "no Warehouse-scoped destination appears in it".
  it('shows no Warehouse-scoped destination', async () => {
    stubAccessAndWorkspace(
      namedWorkspaceContext([WorkspacePermissionId.WAREHOUSES_WATCH]),
    );
    renderSidebar({ entry: ROUTES.WORKSPACE });

    await screen.findByRole('link', { name: 'Workspace' });
    expect(
      screen.queryByRole('link', { name: 'Dashboard' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Access' }),
    ).not.toBeInTheDocument();
  });

  // The gate is unchanged, so the ENTRY is omitted rather than disabled. This
  // actor cannot reach `/workspace` at all (the route guard refuses on the same
  // set), so the criterion says nothing about the landmark here — only that no
  // unusable entry is presented.
  it('omits the Workspace entry — not disabled, not empty — when the actor holds no Workspace capability (AC-30)', async () => {
    stubAccessAndWorkspace(namedWorkspaceContext([]));
    renderSidebar({ entry: ROUTES.WORKSPACE });

    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: 'Workspace' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: 'Workspace' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
  });

  it('hides Workspace during the loading window without rendering a skeleton', async () => {
    stubAccessAndWorkspace(null);
    renderSidebar({ entry: ROUTES.WORKSPACE });

    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: 'Workspace' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/loading/iu)).not.toBeInTheDocument();
  });
});

// CR-AC-18 — with no context entered the sidebar renders no navigation list
// "rather than an empty one", so the <nav> landmark itself must be absent.
// CR-AC-07 — the same holds around a refusal, whose entries would be addressed
// inside a Warehouse the actor was just refused.
describe('Sidebar with no entered context (CR-AC-18)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['at the application root', { entry: ROUTES.HOME }],
    [
      'around a Warehouse entry refusal',
      { entry: warehouseAddress(WAREHOUSE_ONE), verdict: 'refused' as const },
    ],
  ])(
    'renders no list and no navigation landmark %s',
    async (_label, options) => {
      stubAccessAndWorkspace(
        namedWorkspaceContext([WorkspacePermissionId.WAREHOUSES_WATCH]),
      );
      renderSidebar(options);

      await waitFor(() =>
        expect(screen.queryByRole('navigation')).not.toBeInTheDocument(),
      );
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Dashboard' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Workspace' }),
      ).not.toBeInTheDocument();
    },
  );
});

describe('Sidebar drawer behavior (CR-RG-06)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the off-canvas drawer via an external toggle control', async () => {
    stubAccess({ ...baseAccess, permissionIds: [] });
    const user = userEvent.setup();
    renderSidebar({ component: SidebarWithToggle });

    await user.click(
      await screen.findByRole('button', { name: 'Open navigation' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      await screen.findByRole('link', { name: 'Dashboard' }),
    ).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });

  it('closes the drawer on Escape and returns focus to the toggle', async () => {
    stubAccess({ ...baseAccess, permissionIds: [] });
    const user = userEvent.setup();
    renderSidebar({ component: SidebarWithToggle });

    const toggle = await screen.findByRole('button', {
      name: 'Open navigation',
    });
    await user.click(toggle);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(toggle).toHaveFocus());
  });

  it('closes the drawer on an outside click', async () => {
    stubAccess({ ...baseAccess, permissionIds: [] });
    const user = userEvent.setup();
    renderSidebar({ component: SidebarWithToggle });

    await user.click(
      await screen.findByRole('button', { name: 'Open navigation' }),
    );
    await screen.findByRole('dialog');

    await user.click(document.body);

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('wraps the drawer nav list in a navigation landmark', async () => {
    stubAccess({ ...baseAccess, permissionIds: [] });
    const user = userEvent.setup();
    renderSidebar({ component: SidebarWithToggle });

    await user.click(
      await screen.findByRole('button', { name: 'Open navigation' }),
    );
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByRole('navigation')).toBeInTheDocument();
  });

  it('closes the drawer when a nav item is selected', async () => {
    stubAccess({ ...baseAccess, permissionIds: [] });
    const user = userEvent.setup();
    renderSidebar({ component: SidebarWithToggle });

    await user.click(
      await screen.findByRole('button', { name: 'Open navigation' }),
    );
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('link', { name: 'Dashboard' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
});
