import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workspaceContextApi } from 'shared/api/workspace-context-api';
import { RetainedContextMessage } from 'shared/components/RetainedContextMessage';
import { ROUTES } from 'shared/constants/routes';
import { useCurrentWorkspaceContext } from 'shared/hooks/useWorkspacePermissions';
import { makeStore } from 'store';

import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import type { WorkspacePermissionId as WorkspacePermissionIdType } from '@warehouser/shared-types/enums';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type { ReactElement } from 'react';
import type { AppStore } from 'store';

// T19 / change-request:workspace-warehouse — the three retained messages of
// CR-RG-03, moved out of the switcher's fixed-height header slot into the main
// content region (review-2026-08-13 finding 5). The copy and intent are
// unchanged; only the mount point moved, so these cases moved with it from
// `WarehouseSwitcher.spec.tsx`.
//
// The component stays mounted on every page, which is what keeps the
// selection-ended variant reachable: its remembered Warehouse can only be
// observed by something that sees `effectiveWarehouseId` go non-null → null,
// and a block mounted only at `/` never sees the non-null half.

const workspaceId = '00000000-0000-4000-8000-000000000001';
const roleId = '00000000-0000-4000-8000-000000000099';
const centralId = '00000000-0000-4000-8000-000000000010';
const northId = '00000000-0000-4000-8000-000000000011';
const oldDepotId = '00000000-0000-4000-8000-000000000012';

const centralEntry: WorkspaceContext['warehouses'][number] = {
  warehouseId: centralId,
  name: 'Central DC',
  archivedAt: null,
  roleId,
  roleKind: 'warehouse_manager',
};

const northEntry: WorkspaceContext['warehouses'][number] = {
  warehouseId: northId,
  name: 'North Hub',
  archivedAt: null,
  roleId,
  roleKind: 'custom',
};

const archivedOldDepotEntry: WorkspaceContext['warehouses'][number] = {
  warehouseId: oldDepotId,
  name: 'Old Depot',
  archivedAt: '2026-08-01T09:00:00.000Z',
  roleId,
  roleKind: 'custom',
};

const liveOldDepotEntry: WorkspaceContext['warehouses'][number] = {
  ...archivedOldDepotEntry,
  archivedAt: null,
};

type ContextOverrides = {
  effectiveWarehouseId?: string | null;
  warehouses?: WorkspaceContext['warehouses'];
  workspacePermissionIds?: WorkspacePermissionIdType[];
};

const buildContext = ({
  effectiveWarehouseId = null,
  warehouses = [centralEntry, northEntry, archivedOldDepotEntry],
  workspacePermissionIds = [WorkspacePermissionId.WAREHOUSES_WATCH],
}: ContextOverrides = {}): WorkspaceContext => ({
  workspace: { id: workspaceId, name: null },
  workspacePermissionIds,
  warehouses,
  effectiveWarehouseId,
});

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });

const stubFetchSequence = (
  ...responses: Array<() => Response>
): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn();
  for (const factory of responses) {
    fetchMock.mockImplementationOnce(() => Promise.resolve(factory()));
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

/**
 * A sibling of the component under test that subscribes to the same
 * Workspace-context query and reports, in the DOM, that its data has reached
 * React. A case asserting that NO message renders is vacuous without it: the
 * component renders nothing while the read is unresolved, so "no message" would
 * be satisfied by an unresolved read rather than by the condition under test.
 */
const ContextReadyProbe = (): ReactElement | null => {
  const { workspaceContext } = useCurrentWorkspaceContext();
  return workspaceContext ? <p>context ready</p> : null;
};

/**
 * Renders the message from the ROOT route — an ancestor of the Warehouse
 * match, exactly as `RootLayout` mounts it — so "is a context entered?" is read
 * from the matched route tree rather than from any state the component owns.
 */
const renderMessageAt = (
  initialPath: string,
  options: { store?: AppStore } = {},
): { navigateTo: (path: string) => Promise<void>; store: AppStore } => {
  const store = options.store ?? makeStore();
  const rootRoute = createRootRouteWithContext<{ store: AppStore }>()({
    component: (): ReactElement => (
      <>
        <RetainedContextMessage />
        <ContextReadyProbe />
        <Outlet />
      </>
    ),
  });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.HOME,
    component: (): ReactElement => <p>home</p>,
  });
  const workspaceRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.WORKSPACE,
    component: (): ReactElement => <p>workspace view</p>,
  });
  const warehouseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.WAREHOUSE,
    beforeLoad: ({ params }): WarehouseEntryVerdict => ({
      status: 'entered',
      warehouseId: params.warehouseId,
    }),
    component: (): ReactElement => <Outlet />,
  });
  const warehouseIndexRoute = createRoute({
    getParentRoute: () => warehouseRoute,
    path: '/',
    component: (): ReactElement => <p>warehouse view</p>,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      homeRoute,
      workspaceRoute,
      warehouseRoute.addChildren([warehouseIndexRoute]),
    ]),
    context: { store },
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );

  return {
    navigateTo: async (path: string): Promise<void> => {
      await act(async () => {
        await router.navigate({ to: path });
      });
    },
    store,
  };
};

const warehousePath = (warehouseId: string): string =>
  `/warehouses/${warehouseId}`;

describe('RetainedContextMessage — the three retained messages (CR-RG-03)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the never-chosen message when nothing is entered', async () => {
    stubFetchSequence(() => jsonResponse(buildContext()));
    renderMessageAt(ROUTES.HOME);

    expect(
      await screen.findByRole('heading', {
        name: 'Choose a warehouse to work in',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/you belong to 3 warehouses/iu),
    ).toBeInTheDocument();
  });

  it('renders the nothing-available message, and no invented action, when no row is selectable (CR-AC-18)', async () => {
    stubFetchSequence(() =>
      jsonResponse(buildContext({ warehouses: [archivedOldDepotEntry] })),
    );
    renderMessageAt(ROUTES.HOME);

    expect(
      await screen.findByRole('heading', {
        name: 'No warehouse is available to you',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Choose warehouse' }),
    ).not.toBeInTheDocument();
  });

  // The one sequence a live session can actually produce (CR-AC-20): the actor
  // is INSIDE Old Depot when it is archived underneath them, the next reading
  // of `GET /workspace/context` answers a changed body whose
  // `effectiveWarehouseId` is null, nothing evicts them, and only when they
  // reach the root does the message explaining it render. The memory therefore
  // has to survive a navigation, which is exactly what a block mounted at `/`
  // alone cannot do: at `/` the value is already null, so it never sees the
  // non-null half of the transition and this message is unreachable.
  it('renders the selection-ended message naming the Warehouse the actor was in when it was archived', async () => {
    const store = makeStore();
    const fetchMock = stubFetchSequence(
      () =>
        jsonResponse(
          buildContext({
            effectiveWarehouseId: oldDepotId,
            warehouses: [centralEntry, liveOldDepotEntry],
          }),
        ),
      () =>
        jsonResponse(
          buildContext({
            effectiveWarehouseId: null,
            warehouses: [centralEntry],
          }),
        ),
    );
    const { navigateTo } = renderMessageAt(warehousePath(oldDepotId), {
      store,
    });

    await screen.findByText('warehouse view');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    store.dispatch(
      workspaceContextApi.util.invalidateTags(['WorkspaceContext']),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // CR-AC-20 — still inside Old Depot, so nothing is announced there.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await navigateTo(ROUTES.HOME);

    expect(
      await screen.findByRole('alert', {
        name: /old depot is no longer available to you/iu,
      }),
    ).toBeInTheDocument();
  });

  it('shows no retained message inside an entered Warehouse whose entry write never landed', async () => {
    stubFetchSequence(() =>
      jsonResponse(buildContext({ effectiveWarehouseId: null })),
    );
    renderMessageAt(warehousePath(centralId));

    await screen.findByText('warehouse view');
    await screen.findByText('context ready');

    expect(
      screen.queryByRole('heading', {
        name: 'Choose a warehouse to work in',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'No warehouse is available to you',
      }),
    ).not.toBeInTheDocument();
  });

  // CR-AC-09 — the stored selection is where the actor has been, not what they
  // are in. While it still names a live membership there is nothing to explain,
  // so the root announces nothing even though no context is entered.
  it('shows no retained message at the root while the stored selection still names a live membership', async () => {
    stubFetchSequence(() =>
      jsonResponse(buildContext({ effectiveWarehouseId: centralId })),
    );
    renderMessageAt(ROUTES.HOME);

    await screen.findByText('home');
    await screen.findByText('context ready');

    expect(
      screen.queryByRole('heading', {
        name: 'Choose a warehouse to work in',
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows no retained message inside the Workspace view', async () => {
    stubFetchSequence(() =>
      jsonResponse(buildContext({ effectiveWarehouseId: null })),
    );
    renderMessageAt(ROUTES.WORKSPACE);

    await screen.findByText('workspace view');
    await screen.findByText('context ready');

    expect(
      screen.queryByRole('heading', {
        name: 'Choose a warehouse to work in',
      }),
    ).not.toBeInTheDocument();
  });
});
