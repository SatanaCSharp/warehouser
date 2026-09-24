import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import i18n from 'i18n';
import { Provider } from 'react-redux';
import { ROUTES } from 'shared/constants/routes';
import { SidebarNavList } from 'shared/layouts/sidebar/components/SidebarNavList';
import { WorkspaceNavEntries } from 'shared/layouts/sidebar/components/WorkspaceNavEntries';
import type { AppStore } from 'store';
import { makeStore } from 'store';
import { namedWorkspaceContext } from 'test/workspace-fixtures';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import ukCommon from '../../../../../public/locales/uk/common.json';

// The Workspace view's entry set. `Sidebar` selects it from the entered
// context; what this file owns is which entries that set contains and what
// admits them (AC-30, CR-AC-12).
//
// `dashboards` T19 — the set is now two entries, not one: the gated **Dashboard**
// entry first in the rail, and the administration entry after it
// (`design-handoff.md` § Addresses and navigation). The second is relabelled
// through a new `nav.administration` key, because with a second Workspace
// destination present "Workspace" no longer names anything the entry does.

const ADMINISTRATION = 'Administration';
const DASHBOARD = 'Dashboard';

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
  // Only the address this list is rendered at is declared. A `Link` resolves
  // its `href` from the `to` it is given rather than from the tree, exactly as
  // `WarehouseNavEntries.spec.tsx` relies on, so the Dashboard entry needs no
  // route here to be asserted.
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
  // Every case below stubs `fetch`, which would 404 a first-ever request for
  // the `uk` `common` namespace. Loading both languages once here, before any
  // test's stub replaces `fetch`, caches them for the rest of this file so the
  // Ukrainian case's `changeLanguage('uk')` needs no network at all
  // (`modules/item/components/item-directory/ItemDirectory.spec.tsx` is the
  // precedent).
  beforeAll(async () => {
    await i18n.changeLanguage('uk');
    await i18n.changeLanguage('en');
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await i18n.changeLanguage('en');
  });

  // AC-30 — each single Workspace Permission independently admits the entry,
  // because the destination gates each of its parts separately.
  it('offers the Workspace administration destination to an actor holding one of its Permissions', async () => {
    stubWorkspaceContext(
      namedWorkspaceContext([WorkspacePermissionId.WORKSPACE_RENAME]),
    );
    renderEntries();

    expect(
      await screen.findByRole('link', { name: ADMINISTRATION }),
    ).toHaveAttribute('href', ROUTES.WORKSPACE);
  });

  it('omits it — absent, not disabled — when the actor holds none of them', async () => {
    stubWorkspaceContext(namedWorkspaceContext([]));
    renderEntries();

    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: ADMINISTRATION }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: ADMINISTRATION }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(ADMINISTRATION)).not.toBeInTheDocument();
  });

  // CR-AC-12 — "no Warehouse-scoped destination appears in it". The set an
  // administration-only actor is offered is that one entry and nothing else,
  // which is why the count is asserted rather than each absent destination
  // named.
  it('contributes exactly one entry to an administration-only actor, none of it Warehouse-scoped', async () => {
    stubWorkspaceContext(
      namedWorkspaceContext([WorkspacePermissionId.WAREHOUSES_WATCH]),
    );
    renderEntries();

    await screen.findByRole('link', { name: ADMINISTRATION });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  // T19 / `design-handoff.md` § Addresses and navigation — the new entry is
  // first in the rail and addresses `/workspace/dashboard`, which leaves
  // `/workspace` the administration destination at its shipped address.
  it('offers the Dashboard entry first in the rail to a holder of the observation Permission', async () => {
    stubWorkspaceContext(
      namedWorkspaceContext([
        WorkspacePermissionId.WAREHOUSE_PERFORMANCE_WATCH,
        WorkspacePermissionId.WAREHOUSES_WATCH,
      ]),
    );
    renderEntries();

    expect(
      await screen.findByRole('link', { name: DASHBOARD }),
    ).toHaveAttribute('href', ROUTES.WORKSPACE_DASHBOARD);
    expect(screen.getByRole('link', { name: ADMINISTRATION })).toHaveAttribute(
      'href',
      ROUTES.WORKSPACE,
    );

    const entries = screen.getAllByRole('listitem');
    expect(entries).toHaveLength(2);
    expect(
      within(entries[0]).getByRole('link', { name: DASHBOARD }),
    ).toBeInTheDocument();
  });

  // AC-15 — "the navigation entry is absent, so the address is reached only by
  // an actor who already had it". Absent, not disabled: an actor holding every
  // administration Permission and not this one is offered nothing that names
  // the surface.
  it('omits the Dashboard entry entirely without the observation Permission', async () => {
    stubWorkspaceContext(
      namedWorkspaceContext([
        WorkspacePermissionId.WAREHOUSES_WATCH,
        WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
        WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
        WorkspacePermissionId.WORKSPACE_RENAME,
      ]),
    );
    renderEntries();

    await screen.findByRole('link', { name: ADMINISTRATION });
    expect(
      screen.queryByRole('link', { name: DASHBOARD }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(DASHBOARD)).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  // T19 — "the existing rail entry reads Administration in both locales". The
  // Ukrainian case reads the shipped locale file rather than a literal, and
  // asserts the rendered name is that translated value **and not** the English
  // one — which is what an unwritten `uk` key would fall back to.
  it('renders the relabelled entry in Ukrainian from the uk locale file', async () => {
    stubWorkspaceContext(
      namedWorkspaceContext([WorkspacePermissionId.WAREHOUSES_WATCH]),
    );
    await i18n.changeLanguage('uk');
    renderEntries();

    const ukNav: Record<string, string> = ukCommon.nav;
    const administration = ukNav.administration;
    expect(administration).toBeTruthy();
    expect(administration).not.toBe(ADMINISTRATION);
    expect(administration).not.toBe(ukNav.workspace);
    expect(
      await screen.findByRole('link', { name: administration }),
    ).toHaveAttribute('href', ROUTES.WORKSPACE);
  });
});
