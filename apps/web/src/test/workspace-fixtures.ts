import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { vi } from 'vitest';

import { authBecameAuthenticated } from 'modules/auth/store/auth.slice';
import { makeStore } from 'store';

import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import type { AppStore } from 'store';

export const workspaceIds = {
  actingUser: '00000000-0000-4000-8000-000000000101',
  warehouse: '00000000-0000-4000-8000-000000000102',
  warehouseRole: '00000000-0000-4000-8000-000000000103',
  workspace: '00000000-0000-4000-8000-000000000100',
};

export const namedWorkspaceContext = (
  permissionIds: readonly WorkspacePermissionId[] = [],
): WorkspaceContext => ({
  workspace: { id: workspaceIds.workspace, name: 'Acme Logistics' },
  workspacePermissionIds: [...permissionIds],
  warehouses: [
    {
      warehouseId: workspaceIds.warehouse,
      name: 'Main Warehouse',
      archivedAt: null,
      roleId: workspaceIds.warehouseRole,
      roleKind: 'warehouse_manager',
    },
  ],
  effectiveWarehouseId: workspaceIds.warehouse,
});

export const unnamedWorkspaceContext = (
  permissionIds: readonly WorkspacePermissionId[] = [
    WorkspacePermissionId.WORKSPACE_RENAME,
  ],
): WorkspaceContext => ({
  ...namedWorkspaceContext(permissionIds),
  workspace: { id: workspaceIds.workspace, name: null },
});

type WorkspaceServerOptions = {
  context?: WorkspaceContext;
  onRenameWorkspace?: (
    body: unknown,
  ) => { body: unknown; status: number } | undefined;
};

/**
 * Answers the Workspace context read (and, once wired, the Workspace rename
 * write) from in-memory fixtures. Returns the URLs requested, which is how a
 * spec proves a dataset the actor may not read is never fetched and that a
 * mutation actually reached the network.
 */
export const stubWorkspaceServer = ({
  context = namedWorkspaceContext(Object.values(WorkspacePermissionId)),
  onRenameWorkspace,
}: WorkspaceServerOptions = {}): string[] => {
  const requestedUrls: string[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      requestedUrls.push(url);

      if (url.includes('/api/v1/workspace/context')) {
        return Promise.resolve(Response.json(context));
      }

      if (
        url.endsWith('/api/v1/workspace') &&
        (init?.method === 'PATCH' ||
          (input instanceof Request && input.method === 'PATCH'))
      ) {
        const body: unknown =
          typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
        const result = onRenameWorkspace?.(body);
        if (result) {
          return Promise.resolve(
            Response.json(result.body, {
              status: result.status,
            }),
          );
        }
        return Promise.resolve(
          Response.json({ id: workspaceIds.workspace, name: 'Acme Logistics' }),
        );
      }

      return Promise.resolve(Response.json({}, { status: 404 }));
    }),
  );

  return requestedUrls;
};

export const authenticatedWorkspaceStore = (
  userId: string = workspaceIds.actingUser,
): AppStore => {
  const store = makeStore();
  store.dispatch(authBecameAuthenticated({ id: userId }));
  return store;
};
