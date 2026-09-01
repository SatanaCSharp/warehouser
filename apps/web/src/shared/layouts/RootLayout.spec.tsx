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
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type { ReactElement } from 'react';
import type { AppStore } from 'store';

type TestContext = { store: AppStore };

const WAREHOUSE_ADDRESS = '/warehouses/00000000-0000-4000-8000-000000000010';

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
const stubShell = (overrides: Partial<WorkspaceContext> = {}): void => {
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
    ...overrides,
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

type RenderExtras = {
  /** The entry verdict the Warehouse layout publishes for the address. */
  verdict?: WarehouseEntryVerdict['status'];
};

const renderAt = (
  initialEntry: string,
  store: AppStore,
  homeContent: ReactElement = <p>Home content</p>,
  { verdict = 'entered' }: RenderExtras = {},
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
  // T10 — the Sidebar renders a navigation list only inside an entered context
  // (CR-AC-11/CR-AC-12), so a case asserting the shell's composition around it
  // must render at a Warehouse address. The route shares `ROUTES.WAREHOUSE` as
  // its id, which is the id `useEnteredWarehouse` targets.
  const warehouseTestRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.WAREHOUSE,
    beforeLoad: ({ params }): WarehouseEntryVerdict =>
      verdict === 'entered'
        ? { status: 'entered', warehouseId: params.warehouseId }
        : {
            status: 'refused',
            reason: 'not-a-member',
            warehouseId: params.warehouseId,
          },
  });
  const warehouseIndexRoute = createRoute({
    getParentRoute: () => warehouseTestRoute,
    path: '/',
    component: () => homeContent,
  });
  const workspaceTestRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.WORKSPACE,
    component: () => homeContent,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      homeRoute,
      loginRoute,
      signUpRoute,
      workspaceTestRoute,
      warehouseTestRoute.addChildren([warehouseIndexRoute]),
    ]),
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

  it('renders the header-only auth-route shell on /login with no sidebar or footer', async () => {
    renderAt(ROUTES.LOGIN, makeStore());

    expect(
      await screen.findByRole('link', { name: 'Warehouser' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Create account' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  // The auth-route shell used to withhold the language selector deliberately.
  // That left the one place the choice cannot be reached any other way — the
  // sign-in and sign-up copy is translated, but the selector that changes it
  // only appeared once the actor was already signed in.
  it('offers the language selector on the auth routes, where the choice cannot be reached any other way', async () => {
    renderAt(ROUTES.LOGIN, makeStore());

    expect(
      await screen.findByRole('button', { name: /change language/iu }),
    ).toBeInTheDocument();
  });

  it('translates both halves of the auth-route cross-link rather than hard-coding English', async () => {
    renderAt(ROUTES.SIGN_UP, makeStore());

    // `common.auth.signInPrompt` / `common.auth.signIn`, not the literals the
    // header used to render regardless of the active language.
    expect(
      await screen.findByText('Already have an account?'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
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
    renderAt(WAREHOUSE_ADDRESS, authenticatedStore());

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
    renderAt(WAREHOUSE_ADDRESS, authenticatedStore());

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
    renderAt(WAREHOUSE_ADDRESS, authenticatedStore());

    const toggle = await screen.findByRole('button', {
      name: 'Open navigation',
    });
    expect(toggle.className).toContain('sm:hidden');
  });

  // T11 / CR-AC-18 — with no navigation list there is nothing for a drawer to
  // contain, so the toggle that opens it must not render. Any context that
  // renders no sidebar list must therefore render no toggle either, or the
  // shell offers an affordance that opens an empty panel.
  describe('the drawer toggle follows the sidebar list (CR-AC-18)', () => {
    it.each<[string, { entry: string } & RenderExtras]>([
      ['the no-context state at the root', { entry: ROUTES.HOME }],
      [
        'a Warehouse entry refusal',
        { entry: WAREHOUSE_ADDRESS, verdict: 'refused' },
      ],
    ])('renders no drawer toggle in %s', async (_label, options) => {
      stubShell();
      renderAt(options.entry, authenticatedStore(), <p>Home content</p>, {
        verdict: options.verdict,
      });

      // The switcher still renders — it is the only way out of both states.
      await screen.findAllByRole('button', { name: /context switcher/iu });
      expect(
        screen.queryByRole('button', { name: 'Open navigation' }),
      ).not.toBeInTheDocument();
    });

    it.each([
      ['a Warehouse view', WAREHOUSE_ADDRESS],
      ['the Workspace view', ROUTES.WORKSPACE],
    ])('renders the drawer toggle in %s', async (_label, entry) => {
      stubShell();
      renderAt(entry, authenticatedStore());

      expect(
        await screen.findByRole('button', { name: 'Open navigation' }),
      ).toBeInTheDocument();
    });
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
      // T9 / CR-AC-09 — the stored selection may never name or mark anything,
      // so at the root the trigger reads its no-context label rather than the
      // Warehouse `effectiveWarehouseId` happens to name. Query the control by
      // what it always is.
      const headerSwitcher = await within(header).findByRole('button', {
        name: /context switcher/iu,
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
        name: /context switcher/iu,
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

  // T19 / CR-AC-18, CR-RG-03 (review-2026-08-13 finding 5) — the retained
  // messages are page-level content, not chrome. Rendering them inside the
  // switcher put a second heading and, for the selection-ended variant, a
  // two-button Alert inside the fixed-height `header` — twice over, because the
  // switcher is mounted once per viewport placement. They mount once here, in
  // the main content region above the routed outlet, so the memory that makes
  // the selection-ended variant reachable observes every page.
  describe('the retained context message placement (CR-RG-03)', () => {
    it('mounts the retained message once, outside the header and above the outlet', async () => {
      stubShell({ effectiveWarehouseId: null });
      renderAt(ROUTES.HOME, authenticatedStore());

      const pageContent = await screen.findByText('Home content');
      const messages = await screen.findAllByRole('heading', {
        name: 'Choose a warehouse to work in',
      });

      expect(messages).toHaveLength(1);
      expect(screen.getByRole('banner')).not.toContainElement(messages[0]);
      // The routed page follows the message in document order — the message is
      // above the outlet, not below it and not inside the page's own content.
      expect(messages[0].compareDocumentPosition(pageContent)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
  });
});
