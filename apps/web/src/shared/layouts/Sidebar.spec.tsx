import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
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

import type { AccessProjection } from '@warehouser/contracts/access';
import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type { ReactElement } from 'react';
import type { AppStore } from 'store';

const baseAccess: AccessProjection = {
  warehouseId: '00000000-0000-4000-8000-000000000010',
  roleId: '00000000-0000-4000-8000-000000000011',
  roleKind: 'custom',
  permissionIds: [],
  archivedAt: null,
};

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
// (`/api/v1/access/current`), so each Workspace-focused case must answer both
// requests: Access permissionless so only the Workspace assertions are under
// test, and the Workspace context carrying the permissions the case names.
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

// T6 / CR-AC-11 — the Access entry is addressed within the entered Warehouse,
// so the sidebar's own cases render inside a Warehouse match. The Warehouse
// route here shares `ROUTES.WAREHOUSE` as its id — the id `useEnteredWarehouse`
// targets — without importing the production `warehouseRoute` singleton.
const WAREHOUSE_ADDRESS = `/warehouses/${baseAccess.warehouseId}`;
const ACCESS_ADDRESS = `${WAREHOUSE_ADDRESS}/${ROUTE_SEGMENTS.ACCESS}`;

const renderSidebar = (
  store: AppStore = makeStore(),
  component: () => ReactElement = Sidebar,
  initialEntry: string = WAREHOUSE_ADDRESS,
): void => {
  const rootRoute = createRootRouteWithContext<TestContext>()({
    component,
  });
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
  const warehouseTestRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.WAREHOUSE,
    beforeLoad: ({ params }): WarehouseEntryVerdict => ({
      status: 'entered',
      warehouseId: params.warehouseId,
    }),
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
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
};

describe('Sidebar', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('always shows Dashboard linking to the home route', async () => {
    stubAccess({ ...baseAccess, permissionIds: [] });
    renderSidebar();

    expect(
      await screen.findByRole('link', { name: 'Dashboard' }),
    ).toHaveAttribute('href', '/');
  });

  it('shows Access when the actor holds ROLES_WATCH', async () => {
    stubAccess({ ...baseAccess, permissionIds: [PermissionId.ROLES_WATCH] });
    renderSidebar();

    expect(await screen.findByRole('link', { name: 'Access' })).toHaveAttribute(
      'href',
      ACCESS_ADDRESS,
    );
  });

  it('shows Access when the actor holds USERS_WATCH', async () => {
    stubAccess({ ...baseAccess, permissionIds: [PermissionId.USERS_WATCH] });
    renderSidebar();

    expect(await screen.findByRole('link', { name: 'Access' })).toHaveAttribute(
      'href',
      ACCESS_ADDRESS,
    );
  });

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

  it('opens the off-canvas drawer via an external toggle control', async () => {
    stubAccess({ ...baseAccess, permissionIds: [] });
    const user = userEvent.setup();
    renderSidebar(makeStore(), SidebarWithToggle);

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
    renderSidebar(makeStore(), SidebarWithToggle);

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
    renderSidebar(makeStore(), SidebarWithToggle);

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
    renderSidebar(makeStore(), SidebarWithToggle);

    await user.click(
      await screen.findByRole('button', { name: 'Open navigation' }),
    );
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByRole('navigation')).toBeInTheDocument();
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
    renderSidebar(makeStore(), Sidebar, ACCESS_ADDRESS);

    const dashboardLink = await screen.findByRole('link', {
      name: 'Dashboard',
    });
    const accessLink = await screen.findByRole('link', { name: 'Access' });
    expect(accessLink.className).toContain('bg-accent-soft');
    expect(dashboardLink.className).not.toContain('bg-accent-soft');
  });

  it('closes the drawer when a nav item is selected', async () => {
    stubAccess({ ...baseAccess, permissionIds: [] });
    const user = userEvent.setup();
    renderSidebar(makeStore(), SidebarWithToggle);

    await user.click(
      await screen.findByRole('button', { name: 'Open navigation' }),
    );
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('link', { name: 'Dashboard' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  // AC-30: a User with no Workspace capability must not see the Workspace nav
  // entry at all — never disabled, never an empty destination. Each case here
  // proves a *different* single Workspace Permission is enough to admit the
  // entry, because the destination gates each of its parts independently: the
  // three watch Permissions each open their own tab, and `WORKSPACE:RENAME`
  // opens the naming control in the destination's header. The final case
  // proves holding none of them omits the entry entirely.
  it.each([
    ['WAREHOUSES:WATCH', WorkspacePermissionId.WAREHOUSES_WATCH],
    ['WORKSPACE_ROLES:WATCH', WorkspacePermissionId.WORKSPACE_ROLES_WATCH],
    ['WORKSPACE_MEMBERS:WATCH', WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH],
    ['WORKSPACE:RENAME', WorkspacePermissionId.WORKSPACE_RENAME],
  ])('shows Workspace when the actor holds %s', async (_label, permission) => {
    stubAccessAndWorkspace(namedWorkspaceContext([permission]));
    renderSidebar();

    expect(
      await screen.findByRole('link', { name: 'Workspace' }),
    ).toHaveAttribute('href', ROUTES.WORKSPACE);
  });

  it('omits the Workspace nav entry — not disabled, not empty — when the actor holds no Workspace capability (AC-30)', async () => {
    stubAccessAndWorkspace(namedWorkspaceContext([]));
    renderSidebar();

    await screen.findByRole('link', { name: 'Dashboard' });
    expect(
      screen.queryByRole('link', { name: 'Workspace' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Workspace' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
  });

  it('hides Workspace during the loading window without rendering a skeleton', async () => {
    stubAccessAndWorkspace(null);
    renderSidebar();

    expect(
      await screen.findByRole('link', { name: 'Dashboard' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Workspace' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/loading/iu)).not.toBeInTheDocument();
  });
});
