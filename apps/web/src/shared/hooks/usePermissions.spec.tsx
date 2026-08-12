import { renderHook, waitFor } from '@testing-library/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

const access: AccessProjection = {
  warehouseId: '00000000-0000-4000-8000-000000000010',
  roleId: '00000000-0000-4000-8000-000000000011',
  roleKind: 'custom',
  permissionIds: [PermissionId.ROLES_WATCH],
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

  it('retrieves the current permission ids from the cached access projection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json(access))),
    );
    const { result } = renderHook(() => useCurrentPermissions(), {
      wrapper: withStore(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.access).toEqual(access);
    expect(result.current.permissionIds).toEqual([PermissionId.ROLES_WATCH]);
  });

  it('reads permission ids from the same cache entry without an extra request', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(access)));
    vi.stubGlobal('fetch', fetchMock);
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
