import { HeroUIProvider } from '@heroui/react';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ROUTES } from 'shared/constants/routes';
import { Sidebar } from 'shared/layouts/Sidebar';
import { makeStore } from 'store';

import type { AccessProjection } from '@warehouser/contracts/access';
import type { AppStore } from 'store';

const baseAccess: AccessProjection = {
  warehouseId: '00000000-0000-4000-8000-000000000010',
  roleId: '00000000-0000-4000-8000-000000000011',
  roleKind: 'custom',
  permissionIds: [],
};

const stubAccess = (access: AccessProjection | null): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      access
        ? Promise.resolve(Response.json(access))
        : new Promise<Response>(() => {}),
    ),
  );
};

type TestContext = { store: AppStore };

const renderSidebar = (store: AppStore = makeStore()): void => {
  const rootRoute = createRootRouteWithContext<TestContext>()({
    component: Sidebar,
  });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.HOME,
    component: () => null,
  });
  const accessRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.ACCESS,
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, accessRoute]),
    context: { store },
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });

  render(
    <Provider store={store}>
      <HeroUIProvider>
        <RouterProvider router={router} />
      </HeroUIProvider>
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
      '/access',
    );
  });

  it('shows Access when the actor holds USERS_WATCH', async () => {
    stubAccess({ ...baseAccess, permissionIds: [PermissionId.USERS_WATCH] });
    renderSidebar();

    expect(await screen.findByRole('link', { name: 'Access' })).toHaveAttribute(
      'href',
      '/access',
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
});
