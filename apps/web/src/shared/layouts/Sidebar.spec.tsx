import { HeroUIProvider } from '@heroui/react';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ROUTES } from 'shared/constants/routes';
import { Sidebar } from 'shared/layouts/Sidebar';
import { makeStore } from 'store';

import type { AccessProjection } from '@warehouser/contracts/access';
import type { ReactElement } from 'react';
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

const SidebarWithToggle = (): ReactElement => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open navigation</button>
      <Sidebar isOpen={isOpen} onOpenChange={setIsOpen} />
    </>
  );
};

const renderSidebar = (
  store: AppStore = makeStore(),
  component: () => ReactElement = Sidebar,
): void => {
  const rootRoute = createRootRouteWithContext<TestContext>()({
    component,
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
});
