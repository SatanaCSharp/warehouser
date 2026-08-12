import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { vi } from 'vitest';

import { authBecameAuthenticated } from 'modules/auth/store/auth.slice';
import { makeStore } from 'store';

import type {
  AssignableWarehouseRole,
  Warehouse,
  WorkspaceContext,
  WorkspaceUser,
} from '@warehouser/contracts/workspaces';
import type { AppStore } from 'store';

export const workspaceIds = {
  actingUser: '00000000-0000-4000-8000-000000000101',
  warehouse: '00000000-0000-4000-8000-000000000102',
  warehouseRole: '00000000-0000-4000-8000-000000000103',
  workspace: '00000000-0000-4000-8000-000000000100',
};

export const warehouseIds = {
  central: '00000000-0000-4000-8000-000000000110',
  north: '00000000-0000-4000-8000-000000000111',
  oldDepot: '00000000-0000-4000-8000-000000000112',
};

export const otherUserIds = {
  anna: '00000000-0000-4000-8000-000000000120',
  lena: '00000000-0000-4000-8000-000000000121',
};

export const assignableWarehouseRoleIds = {
  picker: '00000000-0000-4000-8000-000000000130',
  supervisor: '00000000-0000-4000-8000-000000000131',
};

/**
 * Central DC's assignable custom Roles — the narrow read `WAREHOUSE_MEMBERSHIPS:ASSIGN`
 * carries: identifiers and names only, the protected Warehouse Manager Role
 * already excluded by the server (AC-23a, AC-25).
 */
export const assignableWarehouseRoles = (): AssignableWarehouseRole[] => [
  { id: assignableWarehouseRoleIds.picker, name: 'Picker' },
  { id: assignableWarehouseRoleIds.supervisor, name: 'Site Supervisor' },
];

/**
 * Three Warehouses of one Workspace: two in operation and one archived, which
 * is the shape every Warehouse-lifecycle case needs (AC-11, AC-11a, AC-12a).
 */
export const workspaceWarehouses = (): Warehouse[] => [
  { id: warehouseIds.central, name: 'Central DC', archivedAt: null },
  { id: warehouseIds.north, name: 'North Hub', archivedAt: null },
  {
    id: warehouseIds.oldDepot,
    name: 'Old Depot',
    archivedAt: '2026-08-01T09:00:00.000Z',
  },
];

/**
 * The Workspace's Users with the Warehouses each belongs to — the read AC-33
 * grants under `WORKSPACE_MEMBERS:WATCH`. It deliberately carries no
 * Warehouse Role: `workspaceUserWarehouseSchema` only names the Warehouse
 * (see `workspaces-projections.ts` and `design-handoff.md` §"The level
 * boundary is part of the design"), so the Warehouse detail pane physically
 * cannot render one.
 */
export const workspaceUsers = (): WorkspaceUser[] => [
  {
    userId: workspaceIds.actingUser,
    email: 'yurii@example.test',
    isWorkspaceMember: true,
    warehouses: [
      { warehouseId: warehouseIds.central },
      { warehouseId: warehouseIds.north },
    ],
  },
  {
    userId: otherUserIds.anna,
    email: 'anna.kravets@example.test',
    isWorkspaceMember: false,
    warehouses: [{ warehouseId: warehouseIds.central }],
  },
  {
    userId: otherUserIds.lena,
    email: 'lena.boiko@example.test',
    isWorkspaceMember: false,
    warehouses: [],
  },
];

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

type StubbedResponse = { body: unknown; status: number };
type StubbedHandler = (body: unknown) => StubbedResponse | undefined;

type WorkspaceServerOptions = {
  assignableRoles?: AssignableWarehouseRole[];
  context?: WorkspaceContext;
  onAssignWarehouseMembership?: StubbedHandler;
  onCreateWarehouse?: StubbedHandler;
  onRenameWarehouse?: StubbedHandler;
  onRenameWorkspace?: StubbedHandler;
  onRevokeWarehouseMembership?: StubbedHandler;
  onSetWarehouseArchival?: StubbedHandler;
  users?: WorkspaceUser[];
  warehouses?: Warehouse[] | 'unavailable';
};

const jsonBody = (init?: RequestInit): unknown =>
  typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

const requestMethod = (
  input: Request | string | URL,
  init?: RequestInit,
): string => init?.method ?? (input instanceof Request ? input.method : 'GET');

/**
 * Answers the Workspace context, Warehouse and Workspace-user reads and the
 * Workspace/Warehouse writes from in-memory fixtures. Returns the URLs
 * requested, which is how a spec proves a dataset the actor may not read is
 * never fetched and that a mutation actually reached the network.
 */
// The stub is one dispatch table over the Workspace HTTP surface; splitting it
// per resource would scatter the fixture contract across files.

export const stubWorkspaceServer = ({
  assignableRoles = assignableWarehouseRoles(),
  context = namedWorkspaceContext(Object.values(WorkspacePermissionId)),
  onAssignWarehouseMembership,
  onCreateWarehouse,
  onRenameWarehouse,
  onRenameWorkspace,
  onRevokeWarehouseMembership,
  onSetWarehouseArchival,
  users = workspaceUsers(),
  warehouses = workspaceWarehouses(),
}: WorkspaceServerOptions = {}): string[] => {
  const requestedUrls: string[] = [];

  vi.stubGlobal(
    'fetch',

    vi.fn((input: Request | string | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = requestMethod(input, init);
      const body = jsonBody(init);
      requestedUrls.push(url);

      const answer = (
        handler: StubbedHandler | undefined,
        fallback: unknown,
      ): Promise<Response> =>
        Promise.resolve(
          ((result) =>
            result
              ? Response.json(result.body, { status: result.status })
              : Response.json(fallback))(handler?.(body)),
        );

      if (url.includes('/api/v1/workspace/context')) {
        return Promise.resolve(Response.json(context));
      }

      if (url.endsWith('/api/v1/workspace/users')) {
        return Promise.resolve(Response.json(users));
      }

      if (url.includes('/archival')) {
        return answer(onSetWarehouseArchival, {
          id: warehouseIds.central,
          name: 'Central DC',
          archivedAt: '2026-08-12T09:00:00.000Z',
        });
      }

      if (url.endsWith('/api/v1/workspace/warehouses')) {
        if (method === 'POST') {
          return answer(onCreateWarehouse, {
            id: '00000000-0000-4000-8000-000000000113',
            name: 'Southgate Cross-dock',
            archivedAt: null,
          });
        }
        return Promise.resolve(
          warehouses === 'unavailable'
            ? Response.json(
                { code: 'api.unexpected', message: 'Unavailable' },
                { status: 500 },
              )
            : Response.json(warehouses),
        );
      }

      if (url.includes('/assignable-roles')) {
        return Promise.resolve(Response.json(assignableRoles));
      }

      if (url.includes('/memberships')) {
        if (method === 'POST') {
          return answer(onAssignWarehouseMembership, {
            userId: otherUserIds.lena,
            warehouseId: warehouseIds.central,
            roleId: assignableWarehouseRoleIds.picker,
            roleKind: 'custom',
          });
        }
        if (method === 'DELETE') {
          const result = onRevokeWarehouseMembership?.(body);
          return Promise.resolve(
            result
              ? Response.json(result.body, { status: result.status })
              : new Response(null, { status: 204 }),
          );
        }
      }

      if (url.includes('/api/v1/workspace/warehouses/')) {
        return answer(onRenameWarehouse, {
          id: warehouseIds.central,
          name: 'Central Distribution',
          archivedAt: null,
        });
      }

      if (url.endsWith('/api/v1/workspace') && method === 'PATCH') {
        return answer(onRenameWorkspace, {
          id: workspaceIds.workspace,
          name: 'Acme Logistics',
        });
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
