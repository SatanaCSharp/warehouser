import { renderHook, waitFor } from '@testing-library/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workspaceContextApi } from 'shared/api/workspace-context-api';
import {
  hasPermission,
  useCurrentPermissions,
  useHasPermission,
} from 'shared/hooks/usePermissions';
import { makeStore } from 'store';

import type { AccessProjection } from '@warehouser/contracts/access';
import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { ReactElement, ReactNode } from 'react';
import type { AppStore } from 'store';

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
 * selection rather than an ambient default.
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

const withStore =
  (store: AppStore = makeStore()) =>
  ({ children }: { children: ReactNode }): ReactElement => (
    <Provider store={store}>{children}</Provider>
  );

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

  it('retrieves the current permission ids from the selected Warehouse projection', async () => {
    const fetchMock = stubProjections(warehouseId, access);
    const { result } = renderHook(() => useCurrentPermissions(), {
      wrapper: withStore(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.access).toEqual(access);
    expect(result.current.permissionIds).toEqual([PermissionId.ROLES_WATCH]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
      currentPath(warehouseId),
    );
  });

  it('reads permission ids from the same cache entry without an extra request', async () => {
    const fetchMock = stubProjections(warehouseId, access);
    const store = makeStore();
    const { result: first } = renderHook(() => useCurrentPermissions(), {
      wrapper: withStore(store),
    });
    await waitFor(() => expect(first.current.isLoading).toBe(false));

    const { result: second } = renderHook(
      () => useHasPermission(PermissionId.ROLES_WATCH),
      { wrapper: withStore(store) },
    );

    expect(second.current).toBe(true);
    expect(
      fetchMock.mock.calls.filter(
        ([url]) => String(url) === currentPath(warehouseId),
      ),
    ).toHaveLength(1);
  });

  it('requests no Warehouse projection while no Warehouse is selected (AC-03b)', async () => {
    const fetchMock = stubProjections(null, access);
    const { result } = renderHook(() => useCurrentPermissions(), {
      wrapper: withStore(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.access).toBeUndefined();
    expect(result.current.permissionIds).toEqual([]);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('/access/current'),
      ),
    ).toHaveLength(0);
  });

  it('reports the newly selected Warehouse authority after a switch, never the previous one (AC-05)', async () => {
    const fetchMock = stubProjections(warehouseId, access, otherAccess);
    const store = makeStore();
    const { result } = renderHook(() => useCurrentPermissions(), {
      wrapper: withStore(store),
    });
    await waitFor(() =>
      expect(result.current.permissionIds).toEqual([PermissionId.ROLES_WATCH]),
    );

    // The member switches Warehouse: the context now resolves the other one.
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      Promise.resolve(
        requestUrl(input) === contextPath
          ? Response.json(workspaceContext(otherWarehouseId))
          : Response.json(
              requestUrl(input) === currentPath(otherWarehouseId)
                ? otherAccess
                : access,
            ),
      ),
    );
    store.dispatch(
      workspaceContextApi.util.invalidateTags(['WorkspaceContext']),
    );

    await waitFor(() =>
      expect(result.current.permissionIds).toEqual([PermissionId.USERS_WATCH]),
    );
    expect(result.current.access?.warehouseId).toBe(otherWarehouseId);
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
