import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ROUTES } from 'shared/constants/routes';
import { SidebarNavList } from 'shared/layouts/sidebar/components/SidebarNavList';
import { WorkspaceNavEntries } from 'shared/layouts/sidebar/components/WorkspaceNavEntries';
import { makeStore } from 'store';
import { namedWorkspaceContext } from 'test/workspace-fixtures';

import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import type { AppStore } from 'store';

// The Workspace view's entry set. `Sidebar` selects it from the entered
// context; what this file owns is which entries that set contains and what
// admits them (AC-30, CR-AC-12).

const stubWorkspaceContext = (context: WorkspaceContext): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      return url.includes('/api/v1/workspace/context')
        ? Promise.resolve(Response.json(context))
        : Promise.resolve(Response.json({}, { status: 404 }));
    }),
  );
};

const renderEntries = (store: AppStore = makeStore()): void => {
  const rootRoute = createRootRouteWithContext<{ store: AppStore }>()({
    component: () => (
      <SidebarNavList isCollapsed={false}>
        <WorkspaceNavEntries isCollapsed={false} />
      </SidebarNavList>
    ),
  });
  const workspaceRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.WORKSPACE,
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([workspaceRoute]),
    context: { store },
    history: createMemoryHistory({ initialEntries: [ROUTES.WORKSPACE] }),
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
};

describe('WorkspaceNavEntries', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // AC-30 — each single Workspace Permission independently admits the entry,
  // because the destination gates each of its parts separately.
  it('offers the Workspace destination to an actor holding one of its Permissions', async () => {
    stubWorkspaceContext(
      namedWorkspaceContext([WorkspacePermissionId.WORKSPACE_RENAME]),
    );
    renderEntries();

    expect(
      await screen.findByRole('link', { name: 'Workspace' }),
    ).toHaveAttribute('href', ROUTES.WORKSPACE);
  });

  it('omits it — absent, not disabled — when the actor holds none of them', async () => {
    stubWorkspaceContext(namedWorkspaceContext([]));
    renderEntries();

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

  // CR-AC-12 — "no Warehouse-scoped destination appears in it". The set is the
  // one entry and nothing else, which is why the count is asserted rather than
  // each absent destination named.
  it('contributes exactly one entry, none of it Warehouse-scoped', async () => {
    stubWorkspaceContext(
      namedWorkspaceContext([WorkspacePermissionId.WAREHOUSES_WATCH]),
    );
    renderEntries();

    await screen.findByRole('link', { name: 'Workspace' });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});
