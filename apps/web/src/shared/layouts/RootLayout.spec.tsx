import { HeroUIProvider } from '@heroui/react';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { authBecameAuthenticated } from 'modules/auth/store/auth.slice';
import { ROUTES } from 'shared/constants/routes';
import { RootLayout } from 'shared/layouts/RootLayout';
import { makeStore } from 'store';

import type { AccessProjection } from '@warehouser/contracts/access';
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
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(Response.json(access))),
  );
};

const renderAt = (initialEntry: string, store: AppStore): void => {
  const rootRoute = createRootRouteWithContext<TestContext>()({
    component: RootLayout,
  });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.HOME,
    component: () => <p>Home content</p>,
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

  render(
    <Provider store={store}>
      <HeroUIProvider>
        <RouterProvider router={router} />
      </HeroUIProvider>
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
});
