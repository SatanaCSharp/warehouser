import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { authBecameAuthenticated } from 'modules/auth/store/auth.slice';
import { ROUTES } from 'shared/constants/routes';
import { RootLayout } from 'shared/layouts/RootLayout';
import { makeStore } from 'store';

import type { AccessProjection } from '@warehouser/contracts/access';
import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';
import type { AppStore } from 'store';

type TestContext = { store: AppStore };

const authenticatedStore = (): AppStore => {
  const store = makeStore();
  store.dispatch(authBecameAuthenticated({ id: 'user-1' }));
  return store;
};

const stubAccess = (permissionIds: AccessProjection['permissionIds']): void => {
  const access: AccessProjection = {
    warehouseId: '00000000-0000-4000-8000-000000000010',
    roleId: '00000000-0000-4000-8000-000000000011',
    roleKind: 'custom',
    permissionIds,
    archivedAt: null,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(Response.json(access))),
  );
};

// T34 — routes both the Workspace-context read (the switcher's data source)
// and the Warehouse-scoped access read (`useCurrentPermissions`, already
// exercised by `stubAccess`) so the switcher actually renders instead of
// falling back to its loading or error state.
const stubShell = (): void => {
  const context: WorkspaceContext = {
    workspace: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Acme Logistics',
    },
    workspacePermissionIds: [],
    warehouses: [
      {
        warehouseId: '00000000-0000-4000-8000-000000000010',
        name: 'Central DC',
        archivedAt: null,
        roleId: '00000000-0000-4000-8000-000000000011',
        roleKind: 'warehouse_manager',
      },
    ],
    effectiveWarehouseId: '00000000-0000-4000-8000-000000000010',
  };
  const access: AccessProjection = {
    warehouseId: '00000000-0000-4000-8000-000000000010',
    roleId: '00000000-0000-4000-8000-000000000011',
    roleKind: 'custom',
    permissionIds: [],
    archivedAt: null,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      return Promise.resolve(
        Response.json(
          url.includes('/api/v1/workspace/context') ? context : access,
        ),
      );
    }),
  );
};

const renderAt = (
  initialEntry: string,
  store: AppStore,
  homeContent: ReactElement = <p>Home content</p>,
): ReturnType<typeof render> => {
  const rootRoute = createRootRouteWithContext<TestContext>()({
    component: RootLayout,
  });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.HOME,
    component: () => homeContent,
  });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.LOGIN,
    component: () => <p>Login content</p>,
  });
  const signUpRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.SIGN_UP,
    component: () => <p>Sign-up content</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, loginRoute, signUpRoute]),
    context: { store },
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });

  return render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
};

describe('RootLayout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the header-only auth-route shell on /login with no sidebar, footer, or language selector', async () => {
    renderAt(ROUTES.LOGIN, makeStore());

    expect(
      await screen.findByRole('link', { name: 'Warehouser' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Create account' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /change language/iu }),
    ).not.toBeInTheDocument();
  });

  it('renders no chrome for the chrome-less, not-authenticated branch', async () => {
    renderAt(ROUTES.HOME, makeStore());

    expect(await screen.findByText('Home content')).toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('composes header + Sidebar + Footer for the authenticated branch, with no inline Access link', async () => {
    stubAccess([]);
    renderAt(ROUTES.HOME, authenticatedStore());

    expect(await screen.findByText('Home content')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /change language/iu }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /sign out/iu }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open navigation' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Access' }),
    ).not.toBeInTheDocument();
  });

  it('opens the Sidebar drawer from the header-hosted toggle', async () => {
    stubAccess([]);
    const user = userEvent.setup();
    renderAt(ROUTES.HOME, authenticatedStore());

    await user.click(
      await screen.findByRole('button', { name: 'Open navigation' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
  });

  it('does not nest a main landmark when the routed page renders its own', async () => {
    stubAccess([]);
    renderAt(ROUTES.HOME, authenticatedStore(), <main>Page content</main>);

    expect(await screen.findByText('Page content')).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('applies flex-col layout only within the authenticated branch', async () => {
    stubAccess([]);
    const authResult = renderAt(ROUTES.HOME, authenticatedStore());
    await screen.findByText('Home content');
    expect(
      authResult.container.querySelector('.flex.flex-col'),
    ).toBeInTheDocument();
    authResult.unmount();

    const loginResult = renderAt(ROUTES.LOGIN, makeStore());
    await screen.findByRole('link', { name: 'Warehouser' });
    expect(
      loginResult.container.querySelector('.flex.flex-col'),
    ).not.toBeInTheDocument();
  });

  it('hides the drawer toggle at and above sm', async () => {
    stubAccess([]);
    renderAt(ROUTES.HOME, authenticatedStore());

    const toggle = await screen.findByRole('button', {
      name: 'Open navigation',
    });
    expect(toggle.className).toContain('sm:hidden');
  });

  // T34 — the Warehouse switcher is added to the shell as one component
  // rendered twice: desktop (`n7Th5`) inside the 80px header, mobile
  // (`ciqhD`) in a full-width context bar directly beneath the 68px header
  // (design-handoff.md §Responsive behavior). "Same component identity, same
  // information, different placement" rules out reflowing one instance with
  // CSS alone, because the mobile placement sits in a different row outside
  // the header entirely.
  describe('the Warehouse switcher shell placement (n7Th5, ciqhD)', () => {
    it('places the switcher inside the header, hidden below sm', async () => {
      stubShell();
      renderAt(ROUTES.HOME, authenticatedStore());

      await screen.findByText('Home content');
      const header = screen.getByRole('banner');
      const headerSwitcher = await within(header).findByRole('button', {
        name: /central dc/iu,
      });
      const headerWrapper = headerSwitcher.closest('[class*="sm:flex"]');
      expect(headerWrapper).not.toBeNull();
      expect(headerWrapper?.className).toContain('hidden');
    });

    it('places a second switcher instance in a full-width context bar under the header, hidden at and above sm', async () => {
      stubShell();
      renderAt(ROUTES.HOME, authenticatedStore());

      await screen.findByText('Home content');
      const header = screen.getByRole('banner');
      const switchers = await screen.findAllByRole('button', {
        name: /central dc/iu,
      });
      expect(switchers).toHaveLength(2);

      const contextBarSwitcher = switchers.find(
        (candidate) => !header.contains(candidate),
      );
      expect(contextBarSwitcher).toBeDefined();
      const contextBarWrapper = contextBarSwitcher?.closest(
        '[class*="sm:hidden"]',
      );
      expect(contextBarWrapper).not.toBeNull();
      expect(contextBarWrapper?.className).toContain('w-full');
    });
  });
});
