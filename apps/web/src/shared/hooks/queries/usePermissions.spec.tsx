import type { AnyRouter } from '@tanstack/react-router';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { AccessProjection } from '@warehouser/contracts/access';
import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { PermissionId } from '@warehouser/shared-types/enums';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { workspaceContextApi } from 'shared/api/workspace/workspace-context-api';
import { ROUTES } from 'shared/constants/routes';
import {
  hasPermission,
  useCurrentPermissions,
  useHasPermission,
} from 'shared/hooks/queries/usePermissions';
import type { AppStore } from 'store';
import { makeStore } from 'store';
import { afterEach, describe, expect, it, vi } from 'vitest';

const warehouseId = '00000000-0000-4000-8000-000000000010';
const otherWarehouseId = '00000000-0000-4000-8000-000000000014';

const access: AccessProjection = {
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000011',
  roleKind: 'custom',
  permissionIds: [PermissionId.ROLES_WATCH],
  archivedAt: null,
};

const otherAccess: AccessProjection = {
  ...access,
  warehouseId: otherWarehouseId,
  permissionIds: [PermissionId.USERS_WATCH],
};

const contextPath = '/api/v1/workspace/context';
const currentPath = (id: string): string =>
  `/api/v1/warehouses/${id}/access/current`;

const workspaceContext = (
  effectiveWarehouseId: string | null,
): Record<string, unknown> => ({
  workspace: { id: '00000000-0000-4000-8000-000000000020', name: 'Acme' },
  workspacePermissionIds: [],
  warehouses: [],
  effectiveWarehouseId,
});

/** `Request`'s default `toString` is not its URL; read it explicitly. */
const requestUrl = (input: RequestInfo | URL): string =>
  input instanceof Request ? input.url : String(input);

/**
 * Answers the actor context with `effectiveWarehouseId`, then each Warehouse's
 * own projection at its own exact URL. A projection requested for a Warehouse
 * this stub was not given 404s, which is how a spec proves the read followed the
 * address rather than an ambient default.
 */
const stubProjections = (
  effectiveWarehouseId: string | null,
  ...projections: AccessProjection[]
): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (url === contextPath) {
      return Promise.resolve(
        Response.json(workspaceContext(effectiveWarehouseId)),
      );
    }
    const projection = projections.find(
      (candidate) => currentPath(candidate.warehouseId) === url,
    );
    return Promise.resolve(
      projection
        ? Response.json(projection)
        : Response.json({}, { status: 404 }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const projectionRequests = (fetchMock: ReturnType<typeof vi.fn>): string[] =>
  fetchMock.mock.calls
    .map(([input]) => requestUrl(input as RequestInfo | URL))
    .filter((url) => url.includes('/access/current'));

/**
 * T6 / CR-AC-06 — `useCurrentPermissions` reads the Warehouse from the address
 * through `useEnteredWarehouse()`, so every case must run inside a real match
 * under the Warehouse layout route. This harness mirrors
 * `useEnteredWarehouse.spec.tsx`: its own tiny route tree whose Warehouse route
 * shares `ROUTES.WAREHOUSE` as its id, so the production `warehouseRoute`
 * singleton is never imported or mutated here. `beforeLoad` derives the verdict
 * from the address, which is what makes a W1 → W2 navigation a genuine
 * re-entry.
 */
const Probe = (): ReactElement => {
  const { access: projection, permissionIds } = useCurrentPermissions();
  return (
    <>
      <div data-testid="permissions">{permissionIds.join(',') || 'none'}</div>
      <div data-testid="projection">{projection?.warehouseId ?? 'none'}</div>
    </>
  );
};

/** T16 / CR-AC-09 — the fields the contract still declares, in the answer. */
const ContractProbe = (): ReactElement => (
  <div data-testid="contract">
    {Object.keys(useCurrentPermissions()).sort().join(',')}
  </div>
);

const HasRolesWatchProbe = (): ReactElement => (
  <div data-testid="has-roles-watch">
    {String(useHasPermission(PermissionId.ROLES_WATCH))}
  </div>
);

type ProbeRouterOptions = {
  entered?: boolean;
  initialEntry: string;
  probe?: () => ReactElement;
  store?: AppStore;
};

const buildProbeRouter = ({
  entered = true,
  initialEntry,
  probe = Probe,
  store = makeStore(),
}: ProbeRouterOptions): { router: AnyRouter; store: AppStore } => {
  const testRootRoute = createRootRouteWithContext<{ store: AppStore }>()({
    component: () => <Outlet />,
  });
  const homeProbeRoute = createRoute({
    getParentRoute: () => testRootRoute,
    path: ROUTES.HOME,
    component: probe,
  });
  const warehouseTestRoute = createRoute({
    getParentRoute: () => testRootRoute,
    path: ROUTES.WAREHOUSE,
    beforeLoad: ({ params }): WarehouseEntryVerdict =>
      entered
        ? { status: 'entered', warehouseId: params.warehouseId }
        : {
            status: 'refused',
            reason: 'not-a-member',
            warehouseId: params.warehouseId,
          },
  });
  const warehouseProbeRoute = createRoute({
    getParentRoute: () => warehouseTestRoute,
    path: '/',
    component: probe,
  });

  const router = createRouter({
    routeTree: testRootRoute.addChildren([
      homeProbeRoute,
      warehouseTestRoute.addChildren([warehouseProbeRoute]),
    ]),
    context: { store },
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });

  return { router, store };
};

const renderProbe = (
  options: ProbeRouterOptions,
): { router: AnyRouter; store: AppStore } => {
  const { router, store } = buildProbeRouter(options);
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return { router, store };
};

const warehouseAddress = (id: string): string => `/warehouses/${id}`;

describe('hasPermission', () => {
  it('treats holding any permission at all as sufficient when none is specified', () => {
    expect(hasPermission([PermissionId.ROLES_WATCH])).toBe(true);
    expect(hasPermission([])).toBe(false);
  });

  it('matches a single required permission', () => {
    expect(
      hasPermission([PermissionId.ROLES_WATCH], PermissionId.ROLES_WATCH),
    ).toBe(true);
    expect(
      hasPermission([PermissionId.ROLES_WATCH], PermissionId.USERS_WATCH),
    ).toBe(false);
  });

  it('matches any of several permissions by default', () => {
    expect(
      hasPermission(
        [PermissionId.USERS_WATCH],
        [PermissionId.ROLES_WATCH, PermissionId.USERS_WATCH],
      ),
    ).toBe(true);
  });

  it('requires every permission when match is "all"', () => {
    expect(
      hasPermission(
        [PermissionId.ROLES_WATCH],
        [PermissionId.ROLES_WATCH, PermissionId.USERS_WATCH],
        'all',
      ),
    ).toBe(false);
    expect(
      hasPermission(
        [PermissionId.ROLES_WATCH, PermissionId.USERS_WATCH],
        [PermissionId.ROLES_WATCH, PermissionId.USERS_WATCH],
        'all',
      ),
    ).toBe(true);
  });
});

describe('useCurrentPermissions / useHasPermission', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // CR-AC-06 — the stored selection deliberately names the OTHER Warehouse, so
  // a projection read for `warehouseId` can only have come from the address.
  it('requests the projection for the addressed Warehouse, not the stored selection (CR-AC-06)', async () => {
    const fetchMock = stubProjections(otherWarehouseId, access, otherAccess);
    renderProbe({ initialEntry: warehouseAddress(warehouseId) });

    await waitFor(() =>
      expect(screen.getByTestId('permissions')).toHaveTextContent(
        PermissionId.ROLES_WATCH,
      ),
    );
    expect(screen.getByTestId('projection')).toHaveTextContent(warehouseId);
    expect(projectionRequests(fetchMock)).toEqual([currentPath(warehouseId)]);
  });

  // CR-AC-06 — outside a Warehouse view there is no addressed Warehouse, so the
  // hook yields no authority and issues no projection read, exactly as it did
  // for a null stored selection before.
  it('yields no permissions and requests no projection outside a Warehouse view', async () => {
    const fetchMock = stubProjections(warehouseId, access);
    renderProbe({ initialEntry: ROUTES.HOME });

    // T16 / CR-AC-09 — the contract carries no readiness field to settle on any
    // more, so the render's own request window is flushed instead: any
    // projection read this hook would issue has been issued by now.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('permissions')).toHaveTextContent('none');
    expect(screen.getByTestId('projection')).toHaveTextContent('none');
    expect(projectionRequests(fetchMock)).toEqual([]);
  });

  // CR-AC-07 — a refusal is not a Warehouse view; nothing inside it may read a
  // projection for the Warehouse the actor was just refused.
  it('requests no projection around a refusal', async () => {
    const fetchMock = stubProjections(warehouseId, access);
    renderProbe({
      entered: false,
      initialEntry: warehouseAddress(warehouseId),
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('permissions')).toHaveTextContent('none');
    expect(projectionRequests(fetchMock)).toEqual([]);
  });

  // CR-AC-06 second clause — "changing which Warehouse is recorded as the
  // actor's stored selection changes nothing about what an already-open address
  // shows". The record is rewritten underneath an open address here; the view
  // must not move.
  it('ignores a change to the stored selection while an address is open (CR-AC-06)', async () => {
    const fetchMock = stubProjections(warehouseId, access, otherAccess);
    const store = makeStore();
    renderProbe({ initialEntry: warehouseAddress(warehouseId), store });
    await waitFor(() =>
      expect(screen.getByTestId('projection')).toHaveTextContent(warehouseId),
    );

    await act(async () => {
      await store
        .dispatch(
          workspaceContextApi.endpoints.getWorkspaceContext.initiate(undefined),
        )
        .unwrap();
      store.dispatch(
        workspaceContextApi.util.updateQueryData(
          'getWorkspaceContext',
          undefined,
          (draft) => ({ ...draft, effectiveWarehouseId: otherWarehouseId }),
        ),
      );
    });

    expect(screen.getByTestId('projection')).toHaveTextContent(warehouseId);
    expect(screen.getByTestId('permissions')).toHaveTextContent(
      PermissionId.ROLES_WATCH,
    );
    expect(projectionRequests(fetchMock)).toEqual([currentPath(warehouseId)]);
  });

  // CR-AC-06 — moving the address from W1 to W2 reports W2's authority, never
  // the one held in W1.
  it('reports the newly addressed Warehouse authority after a W1 to W2 navigation', async () => {
    stubProjections(null, access, otherAccess);
    const { router } = renderProbe({
      initialEntry: warehouseAddress(warehouseId),
    });
    await waitFor(() =>
      expect(screen.getByTestId('permissions')).toHaveTextContent(
        PermissionId.ROLES_WATCH,
      ),
    );

    await act(async () => {
      await router.navigate({
        to: ROUTES.WAREHOUSE,
        params: { warehouseId: otherWarehouseId },
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId('permissions')).toHaveTextContent(
        PermissionId.USERS_WATCH,
      ),
    );
    expect(screen.getByTestId('projection')).toHaveTextContent(
      otherWarehouseId,
    );
  });

  // CR-RG-03's falsifier, pinned at the hook. The route loader narrows the
  // window in which the leak is observable through the UI, so the boundary is
  // asserted here: across the argument change, while W2's projection is still
  // in flight, the hook must report NOTHING. RTK Query's `data` is the last
  // successful result this hook instance saw for ANY argument, so replacing
  // `currentData` with `data` in `usePermissions.ts` reports W1's Warehouse and
  // W1's Permissions for W2 — and fails the two assertions below.
  it('reports no authority for the newly addressed Warehouse while its projection is in flight (CR-RG-03)', async () => {
    let releaseOtherProjection = (): void => {};
    const otherProjectionArrives = new Promise<void>((resolve) => {
      releaseOtherProjection = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url === contextPath) {
        return Response.json(workspaceContext(null));
      }
      if (url === currentPath(warehouseId)) {
        return Response.json(access);
      }
      if (url === currentPath(otherWarehouseId)) {
        await otherProjectionArrives;
        return Response.json(otherAccess);
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { router } = renderProbe({
      initialEntry: warehouseAddress(warehouseId),
    });
    await waitFor(() =>
      expect(screen.getByTestId('permissions')).toHaveTextContent(
        PermissionId.ROLES_WATCH,
      ),
    );

    await act(async () => {
      await router.navigate({
        to: ROUTES.WAREHOUSE,
        params: { warehouseId: otherWarehouseId },
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId('projection')).toHaveTextContent('none'),
    );
    expect(screen.getByTestId('permissions')).toHaveTextContent('none');

    await act(async () => {
      releaseOtherProjection();
      await otherProjectionArrives;
    });
    await waitFor(() =>
      expect(screen.getByTestId('permissions')).toHaveTextContent(
        PermissionId.USERS_WATCH,
      ),
    );
    expect(screen.getByTestId('projection')).toHaveTextContent(
      otherWarehouseId,
    );
  });

  // CR-AC-09 — `CurrentPermissions` declares no `isLoading`. The route loader
  // has already awaited this projection, so the hook reports the answer it has
  // and nothing about how it got there.
  it('reports exactly the projection and its Permission ids (CR-AC-09)', async () => {
    stubProjections(null, access);
    renderProbe({
      initialEntry: warehouseAddress(warehouseId),
      probe: ContractProbe,
    });

    await waitFor(() =>
      expect(screen.getByTestId('contract')).toHaveTextContent(
        /^access,permissionIds$/u,
      ),
    );
  });

  it('reads permission ids from the same cache entry without an extra request', async () => {
    const fetchMock = stubProjections(null, access);
    const store = makeStore();
    renderProbe({ initialEntry: warehouseAddress(warehouseId), store });
    await waitFor(() =>
      expect(screen.getByTestId('projection')).toHaveTextContent(warehouseId),
    );

    renderProbe({
      initialEntry: warehouseAddress(warehouseId),
      probe: HasRolesWatchProbe,
      store,
    });

    await waitFor(() =>
      expect(screen.getByTestId('has-roles-watch')).toHaveTextContent('true'),
    );
    expect(projectionRequests(fetchMock)).toEqual([currentPath(warehouseId)]);
  });
});

describe('PermissionId / WorkspacePermissionId vocabulary separation (AC-31)', () => {
  it('never accepts the Workspace-level WorkspacePermissionId as the permission hook parameter', () => {
    type PermissionHookParam = Parameters<typeof useHasPermission>[0];
    const workspacePermission = 'WORKSPACE:RENAME' as WorkspacePermissionId;

    // @ts-expect-error a Workspace-level WorkspacePermissionId must never satisfy the
    // Warehouse-level hook's PermissionId parameter — the two authorization vocabularies never
    // meet (AC-31).
    const asPermissionHookParam: PermissionHookParam = workspacePermission;

    expect(typeof asPermissionHookParam).toBe('string');
  });
});
