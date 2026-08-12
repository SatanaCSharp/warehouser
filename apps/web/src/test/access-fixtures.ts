import { PermissionId } from '@warehouser/shared-types/enums';
import { vi } from 'vitest';

import { authBecameAuthenticated } from 'modules/auth/store/auth.slice';
import { makeStore } from 'store';

import type {
  MemberPage,
  PermissionPage,
  RolePage,
} from '@warehouser/contracts/access';
import type { AppStore } from 'store';

export const accessIds = {
  actingUser: '00000000-0000-4000-8000-000000000003',
  auditorRole: '00000000-0000-4000-8000-000000000013',
  manager: '00000000-0000-4000-8000-000000000001',
  managerRole: '00000000-0000-4000-8000-000000000011',
  member: '00000000-0000-4000-8000-000000000002',
  otherWarehouse: '00000000-0000-4000-8000-000000000014',
  pickerRole: '00000000-0000-4000-8000-000000000012',
  warehouse: '00000000-0000-4000-8000-000000000010',
  workspace: '00000000-0000-4000-8000-000000000015',
};

/**
 * The Warehouse-scoped REST paths, built exactly as `contracts/openapi.yaml`
 * declares them. Specs route their stub and assert against these rather than
 * matching a suffix: a suffix match is what let the pre-`T26` paths keep passing
 * after the server moved every Warehouse-scoped handler under its Warehouse.
 */
export const accessPath = (warehouseId: string, resource: string): string =>
  `/api/v1/warehouses/${warehouseId}/access/${resource}`;

export const usersPath = (warehouseId: string, resource = ''): string =>
  `/api/v1/warehouses/${warehouseId}/users${resource ? `/${resource}` : ''}`;

export const accessRoles: RolePage['items'] = [
  {
    id: accessIds.managerRole,
    kind: 'warehouse_manager',
    name: 'Warehouse Manager',
    permissionIds: Object.values(PermissionId),
    assignedMemberCount: 1,
  },
  {
    id: accessIds.pickerRole,
    kind: 'custom',
    name: 'Picker',
    permissionIds: [],
    assignedMemberCount: 1,
  },
  {
    id: accessIds.auditorRole,
    kind: 'custom',
    name: 'Auditor',
    permissionIds: [PermissionId.ROLES_WATCH],
    assignedMemberCount: 0,
  },
];

export const accessPermissions: PermissionPage['items'] = [
  { id: PermissionId.ROLES_WATCH, kind: 'assignable', label: 'View roles' },
  {
    id: PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
    kind: 'reserved',
    label: 'Transfer Warehouse Manager',
  },
];

export const accessMembers: MemberPage['items'] = [
  {
    userId: accessIds.manager,
    roleId: accessIds.managerRole,
    roleKind: 'warehouse_manager',
    email: 'manager@example.test',
  },
  {
    userId: accessIds.member,
    roleId: accessIds.pickerRole,
    roleKind: 'custom',
    email: 'member@example.test',
  },
];

const asPage = <TItem>(items: TItem[]): Record<string, unknown> => ({
  hasNext: false,
  hasPrev: false,
  nextCursor: null,
  items,
});

type AccessServerOptions = {
  /** The Warehouse's own archived timestamp, as its projection reports it. */
  archivedAt?: string | null;
  members?: MemberPage['items'];
  permissionIds?: readonly PermissionId[];
  permissions?: PermissionPage['items'];
  roles?: RolePage['items'];
  /** The Warehouse the actor context resolves as the effective selection. */
  warehouseId?: string;
};

const workspaceContextFor = (warehouseId: string): Record<string, unknown> => ({
  workspace: { id: accessIds.workspace, name: 'Acme Logistics' },
  workspacePermissionIds: [],
  warehouses: [
    {
      warehouseId,
      name: 'Main Warehouse',
      archivedAt: null,
      roleId: accessIds.managerRole,
      roleKind: 'warehouse_manager',
    },
  ],
  effectiveWarehouseId: warehouseId,
});

/**
 * Answers the actor context and the four Warehouse-scoped access reads from
 * in-memory fixtures, so a spec can render a tab exactly as the workspace mounts
 * it. Every route is matched by its **exact** per-Warehouse URL, so a request
 * that forgets its Warehouse 404s here just as it would against the server.
 * Returns the URLs requested, which is how a spec proves a dataset the actor may
 * not see is never fetched.
 */
export const stubAccessServer = ({
  archivedAt = null,
  members = accessMembers,
  permissionIds = Object.values(PermissionId),
  permissions = accessPermissions,
  roles = accessRoles,
  warehouseId = accessIds.warehouse,
}: AccessServerOptions = {}): string[] => {
  const requestedUrls: string[] = [];
  const routes: [string, Record<string, unknown>][] = [
    ['/api/v1/workspace/context', workspaceContextFor(warehouseId)],
    [
      accessPath(warehouseId, 'current'),
      {
        warehouseId,
        roleId: accessIds.managerRole,
        roleKind: 'warehouse_manager',
        permissionIds,
        archivedAt,
      },
    ],
    [accessPath(warehouseId, 'roles'), asPage(roles)],
    [accessPath(warehouseId, 'permissions'), asPage(permissions)],
    [accessPath(warehouseId, 'members'), asPage(members)],
  ];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      requestedUrls.push(url);
      const route = routes.find(([path]) => url === path);
      return Promise.resolve(
        route ? Response.json(route[1]) : Response.json({}, { status: 404 }),
      );
    }),
  );

  return requestedUrls;
};

export const authenticatedStore = (
  userId: string = accessIds.actingUser,
): AppStore => {
  const store = makeStore();
  store.dispatch(authBecameAuthenticated({ id: userId }));
  return store;
};
