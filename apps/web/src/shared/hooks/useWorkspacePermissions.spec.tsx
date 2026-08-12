import { renderHook, waitFor } from '@testing-library/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  hasWorkspacePermission,
  useCurrentWorkspaceContext,
  useHasWorkspacePermission,
} from 'shared/hooks/useWorkspacePermissions';
import { makeStore } from 'store';

import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import type { PermissionId } from '@warehouser/shared-types/enums';
import type { ReactElement, ReactNode } from 'react';
import type { AppStore } from 'store';

const ownWorkspaceContext: WorkspaceContext = {
  workspace: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Test Workspace',
  },
  workspacePermissionIds: [WorkspacePermissionId.WAREHOUSES_WATCH],
  warehouses: [],
  effectiveWarehouseId: null,
};

// AC-30 (docs/features/workspaces/spec.md §5): a Warehouse Member who is no Workspace Member
// at all — the `noWorkspaceCapabilities` example of `GET /api/v1/workspace/context`.
const noMembershipContext: WorkspaceContext = {
  workspace: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Test Workspace',
  },
  workspacePermissionIds: [],
  warehouses: [
    {
      warehouseId: '00000000-0000-4000-8000-000000000010',
      name: 'Test Warehouse North',
      archivedAt: null,
      roleId: '00000000-0000-4000-8000-000000000022',
      roleKind: 'custom',
    },
  ],
  effectiveWarehouseId: '00000000-0000-4000-8000-000000000010',
};

const withStore =
  (store: AppStore = makeStore()) =>
  ({ children }: { children: ReactNode }): ReactElement => (
    <Provider store={store}>{children}</Provider>
  );

describe('hasWorkspacePermission', () => {
  it('matches a single required Workspace Permission', () => {
    expect(
      hasWorkspacePermission(
        [WorkspacePermissionId.WAREHOUSES_WATCH],
        WorkspacePermissionId.WAREHOUSES_WATCH,
      ),
    ).toBe(true);
    expect(
      hasWorkspacePermission(
        [WorkspacePermissionId.WAREHOUSES_WATCH],
        WorkspacePermissionId.WORKSPACE_RENAME,
      ),
    ).toBe(false);
  });
});

describe('useCurrentWorkspaceContext / useHasWorkspacePermission', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retrieves the current Workspace Permission ids from the cached actor context', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json(ownWorkspaceContext));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCurrentWorkspaceContext(), {
      wrapper: withStore(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.workspacePermissionIds).toEqual([
      WorkspacePermissionId.WAREHOUSES_WATCH,
    ]);
  });

  it('derives no Workspace capability for a User with no Workspace membership (AC-30)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json(noMembershipContext));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    const { result } = renderHook(
      () => useHasWorkspacePermission(WorkspacePermissionId.WAREHOUSES_CREATE),
      { wrapper: withStore(store) },
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/workspace/context',
        expect.anything(),
      ),
    );
    await waitFor(() => expect(result.current).toBe(false));

    // Deriving the (absent) capability must not trigger any further Workspace request —
    // only the single actor-context read backs every Workspace capability check.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads Workspace Permission ids from the same cache entry without an extra request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json(ownWorkspaceContext));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();
    const { result: first } = renderHook(() => useCurrentWorkspaceContext(), {
      wrapper: withStore(store),
    });
    await waitFor(() => expect(first.current.isLoading).toBe(false));

    const { result: second } = renderHook(
      () => useHasWorkspacePermission(WorkspacePermissionId.WAREHOUSES_WATCH),
      { wrapper: withStore(store) },
    );

    expect(second.current).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('WorkspacePermissionId / PermissionId vocabulary separation (AC-31)', () => {
  it('never accepts the Warehouse-level PermissionId as the Workspace hook parameter', () => {
    type WorkspaceHookParam = Parameters<typeof useHasWorkspacePermission>[0];
    const warehousePermission = 'ROLES:WATCH' as PermissionId;

    // @ts-expect-error a Warehouse-level PermissionId must never satisfy the Workspace hook's
    // WorkspacePermissionId parameter — the two authorization vocabularies never meet (AC-31).
    const asWorkspaceHookParam: WorkspaceHookParam = warehousePermission;

    expect(typeof asWorkspaceHookParam).toBe('string');
  });
});
