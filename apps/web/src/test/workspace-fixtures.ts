import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { vi } from 'vitest';

import { authBecameAuthenticated } from 'modules/auth/store/auth.slice';
import { makeStore } from 'store';

import type {
  AssignableWarehouseRole,
  Warehouse,
  WorkspaceContext,
  WorkspaceMember,
  WorkspacePermission,
  WorkspaceRole,
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

export const workspaceRoleIds = {
  owner: '00000000-0000-4000-8000-000000000140',
  operations: '00000000-0000-4000-8000-000000000141',
  auditor: '00000000-0000-4000-8000-000000000142',
};

/**
 * The system Workspace Permission catalogue, copied from the seed rows of
 * migration `1786524800000-CreateWorkspaceAuthoritySchema.ts`.
 * `WORKSPACE_OWNER_ROLE:REASSIGN` is the sole `reserved` row — the one a
 * custom Workspace Role may never carry (AC-18).
 */
export const workspacePermissions = (): WorkspacePermission[] => [
  {
    id: WorkspacePermissionId.WORKSPACE_RENAME,
    label: 'Rename workspace',
    kind: 'assignable',
  },
  {
    id: WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
    label: 'View workspace roles',
    kind: 'assignable',
  },
  {
    id: WorkspacePermissionId.WORKSPACE_ROLES_CREATE,
    label: 'Create workspace roles',
    kind: 'assignable',
  },
  {
    id: WorkspacePermissionId.WORKSPACE_ROLES_UPDATE,
    label: 'Update workspace roles',
    kind: 'assignable',
  },
  {
    id: WorkspacePermissionId.WORKSPACE_ROLES_DELETE,
    label: 'Delete workspace roles',
    kind: 'assignable',
  },
  {
    id: WorkspacePermissionId.WORKSPACE_ROLES_ASSIGN,
    label: 'Assign workspace roles',
    kind: 'assignable',
  },
  {
    id: WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
    label: 'View workspace members',
    kind: 'assignable',
  },
  {
    id: WorkspacePermissionId.WORKSPACE_MEMBERS_ADD,
    label: 'Add workspace members',
    kind: 'assignable',
  },
  {
    id: WorkspacePermissionId.WORKSPACE_MEMBERS_REMOVE,
    label: 'Remove workspace members',
    kind: 'assignable',
  },
  {
    id: WorkspacePermissionId.WAREHOUSES_WATCH,
    label: 'View warehouses',
    kind: 'assignable',
  },
  {
    id: WorkspacePermissionId.WAREHOUSES_CREATE,
    label: 'Create warehouses',
    kind: 'assignable',
  },
  {
    id: WorkspacePermissionId.WAREHOUSES_RENAME,
    label: 'Rename warehouses',
    kind: 'assignable',
  },
  {
    id: WorkspacePermissionId.WAREHOUSES_ARCHIVE,
    label: 'Archive and restore warehouses',
    kind: 'assignable',
  },
  {
    id: WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
    label: 'Assign warehouse memberships',
    kind: 'assignable',
  },
  {
    id: WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_REVOKE,
    label: 'Revoke warehouse memberships',
    kind: 'assignable',
  },
  {
    id: WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN,
    label: 'Transfer workspace ownership',
    kind: 'reserved',
  },
];

/**
 * The protected Workspace Owner Role plus two custom ones: `Operations Lead`
 * is assigned to a Workspace Member and `Auditor` is not, which is the shape
 * delete-with-replacement (AC-17) and delete-without-replacement (AC-17a) both
 * need.
 */
export const workspaceRoles = (): WorkspaceRole[] => [
  {
    id: workspaceRoleIds.owner,
    name: 'Workspace owner',
    kind: 'workspace_owner',
    workspacePermissionIds: workspacePermissions().map(
      (permission) => permission.id,
    ),
    assignedMemberCount: 1,
  },
  {
    id: workspaceRoleIds.operations,
    name: 'Operations Lead',
    kind: 'custom',
    workspacePermissionIds: [
      WorkspacePermissionId.WAREHOUSES_WATCH,
      WorkspacePermissionId.WAREHOUSES_CREATE,
    ],
    assignedMemberCount: 1,
  },
  {
    id: workspaceRoleIds.auditor,
    name: 'Auditor',
    kind: 'custom',
    workspacePermissionIds: [WorkspacePermissionId.WAREHOUSES_WATCH],
    assignedMemberCount: 0,
  },
];

/**
 * The Workspace Members: the acting user owns the Workspace and Anna holds a
 * custom Workspace Role. Lena is a User of the Workspace but no Member, so she
 * is the only valid add-candidate (AC-19).
 */
export const workspaceMembers = (): WorkspaceMember[] => [
  {
    userId: workspaceIds.actingUser,
    email: 'yurii@example.test',
    workspaceRoleId: workspaceRoleIds.owner,
    workspaceRoleKind: 'workspace_owner',
  },
  {
    userId: otherUserIds.anna,
    email: 'anna.kravets@example.test',
    workspaceRoleId: workspaceRoleIds.operations,
    workspaceRoleKind: 'custom',
  },
];

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
    isWorkspaceMember: true,
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
  members?: WorkspaceMember[];
  onAddWorkspaceMember?: StubbedHandler;
  onAssignWarehouseMembership?: StubbedHandler;
  onAssignWorkspaceRole?: StubbedHandler;
  onCreateWarehouse?: StubbedHandler;
  onCreateWorkspaceRole?: StubbedHandler;
  onDeleteWorkspaceRole?: StubbedHandler;
  onRemoveWorkspaceMember?: StubbedHandler;
  onRenameWarehouse?: StubbedHandler;
  onRenameWorkspace?: StubbedHandler;
  onRevokeWarehouseMembership?: StubbedHandler;
  onSetWarehouseArchival?: StubbedHandler;
  onTransferWorkspaceOwner?: StubbedHandler;
  onUpdateWorkspaceRole?: StubbedHandler;
  permissions?: WorkspacePermission[];
  roles?: WorkspaceRole[];
  users?: WorkspaceUser[];
  warehouses?: Warehouse[] | 'unavailable';
};

const jsonBody = (init?: RequestInit): unknown =>
  typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

const requestMethod = (
  input: Request | string | URL,
  init?: RequestInit,
): string => init?.method ?? (input instanceof Request ? input.method : 'GET');

type StubbedRoute = { body: unknown; method: string; url: string };

type ResolvedWorkspaceServerOptions = WorkspaceServerOptions &
  Required<
    Pick<
      WorkspaceServerOptions,
      | 'assignableRoles'
      | 'context'
      | 'members'
      | 'permissions'
      | 'roles'
      | 'users'
      | 'warehouses'
    >
  >;

/** A stubbed write answers its handler's response, or the committed fallback. */
const answerWrite = (
  handler: StubbedHandler | undefined,
  body: unknown,
  fallback: () => Response,
): Promise<Response> => {
  const stubbed = handler?.(body);
  return Promise.resolve(
    stubbed
      ? Response.json(stubbed.body, { status: stubbed.status })
      : fallback(),
  );
};

const noContent = (): Response => new Response(null, { status: 204 });

/**
 * The Workspace's own authority surface: the actor context, the Users read,
 * the Workspace Roles, the system Permission catalogue, the Workspace Members
 * and the protected Owner transfer.
 */
const answerWorkspaceAuthorityRoute = (
  { body, method, url }: StubbedRoute,
  options: ResolvedWorkspaceServerOptions,
): Promise<Response> | undefined => {
  if (url.includes('/api/v1/workspace/context')) {
    return Promise.resolve(Response.json(options.context));
  }

  if (url.endsWith('/api/v1/workspace/users')) {
    return Promise.resolve(Response.json(options.users));
  }

  if (url.endsWith('/api/v1/workspace/permissions')) {
    return Promise.resolve(Response.json(options.permissions));
  }

  if (url.endsWith('/api/v1/workspace/owner-transfer')) {
    return answerWrite(options.onTransferWorkspaceOwner, body, () =>
      Response.json({
        ownerUserId: otherUserIds.anna,
        formerOwnerUserId: workspaceIds.actingUser,
        formerOwnerWorkspaceRoleId: workspaceRoleIds.operations,
      }),
    );
  }

  if (url.includes('/api/v1/workspace/roles')) {
    if (method === 'POST') {
      return answerWrite(options.onCreateWorkspaceRole, body, () =>
        Response.json({
          id: '00000000-0000-4000-8000-000000000143',
          name: 'Warehouse Planner',
          kind: 'custom',
          workspacePermissionIds: [],
          assignedMemberCount: 0,
        }),
      );
    }
    if (method === 'PATCH') {
      return answerWrite(options.onUpdateWorkspaceRole, body, () =>
        Response.json({
          id: workspaceRoleIds.operations,
          name: 'Operations Lead',
          kind: 'custom',
          workspacePermissionIds: [],
          assignedMemberCount: 1,
        }),
      );
    }
    if (method === 'DELETE') {
      return answerWrite(options.onDeleteWorkspaceRole, body, noContent);
    }
    return Promise.resolve(Response.json(options.roles));
  }

  if (url.includes('/api/v1/workspace/members')) {
    if (method === 'POST') {
      return answerWrite(options.onAddWorkspaceMember, body, () =>
        Response.json({
          userId: otherUserIds.lena,
          workspaceRoleId: workspaceRoleIds.auditor,
          workspaceRoleKind: 'custom',
        }),
      );
    }
    if (method === 'PUT') {
      return answerWrite(options.onAssignWorkspaceRole, body, () =>
        Response.json({
          userId: otherUserIds.anna,
          workspaceRoleId: workspaceRoleIds.auditor,
          workspaceRoleKind: 'custom',
        }),
      );
    }
    if (method === 'DELETE') {
      return answerWrite(options.onRemoveWorkspaceMember, body, noContent);
    }
    return Promise.resolve(Response.json(options.members));
  }

  if (url.endsWith('/api/v1/workspace') && method === 'PATCH') {
    return answerWrite(options.onRenameWorkspace, body, () =>
      Response.json({ id: workspaceIds.workspace, name: 'Acme Logistics' }),
    );
  }

  return undefined;
};

/**
 * The Warehouse-record surface the Workspace owns: the Warehouse list, its
 * lifecycle writes, the narrow assignable-Roles read and the membership edges.
 */
const answerWarehouseRecordRoute = (
  { body, method, url }: StubbedRoute,
  options: ResolvedWorkspaceServerOptions,
): Promise<Response> | undefined => {
  if (url.includes('/archival')) {
    return answerWrite(options.onSetWarehouseArchival, body, () =>
      Response.json({
        id: warehouseIds.central,
        name: 'Central DC',
        archivedAt: '2026-08-12T09:00:00.000Z',
      }),
    );
  }

  if (url.endsWith('/api/v1/workspace/warehouses')) {
    if (method === 'POST') {
      return answerWrite(options.onCreateWarehouse, body, () =>
        Response.json({
          id: '00000000-0000-4000-8000-000000000113',
          name: 'Southgate Cross-dock',
          archivedAt: null,
        }),
      );
    }
    return Promise.resolve(
      options.warehouses === 'unavailable'
        ? Response.json(
            { code: 'api.unexpected', message: 'Unavailable' },
            { status: 500 },
          )
        : Response.json(options.warehouses),
    );
  }

  if (url.includes('/assignable-roles')) {
    return Promise.resolve(Response.json(options.assignableRoles));
  }

  if (url.includes('/memberships')) {
    if (method === 'POST') {
      return answerWrite(options.onAssignWarehouseMembership, body, () =>
        Response.json({
          userId: otherUserIds.lena,
          warehouseId: warehouseIds.central,
          roleId: assignableWarehouseRoleIds.picker,
          roleKind: 'custom',
        }),
      );
    }
    if (method === 'DELETE') {
      return answerWrite(options.onRevokeWarehouseMembership, body, noContent);
    }
  }

  if (url.includes('/api/v1/workspace/warehouses/')) {
    return answerWrite(options.onRenameWarehouse, body, () =>
      Response.json({
        id: warehouseIds.central,
        name: 'Central Distribution',
        archivedAt: null,
      }),
    );
  }

  return undefined;
};

/**
 * Answers the Workspace's reads and writes from in-memory fixtures. Returns
 * the URLs requested, which is how a spec proves a dataset the actor may not
 * read is never fetched and that a mutation actually reached the network.
 */
export const stubWorkspaceServer = (
  options: WorkspaceServerOptions = {},
): string[] => {
  const requestedUrls: string[] = [];
  const resolved: ResolvedWorkspaceServerOptions = {
    assignableRoles: assignableWarehouseRoles(),
    context: namedWorkspaceContext(Object.values(WorkspacePermissionId)),
    members: workspaceMembers(),
    permissions: workspacePermissions(),
    roles: workspaceRoles(),
    users: workspaceUsers(),
    warehouses: workspaceWarehouses(),
    ...options,
  };

  vi.stubGlobal(
    'fetch',

    vi.fn((input: Request | string | URL, init?: RequestInit) => {
      const route: StubbedRoute = {
        body: jsonBody(init),
        method: requestMethod(input, init),
        url: String(input instanceof Request ? input.url : input),
      };
      requestedUrls.push(route.url);

      return (
        answerWorkspaceAuthorityRoute(route, resolved) ??
        answerWarehouseRecordRoute(route, resolved) ??
        Promise.resolve(Response.json({}, { status: 404 }))
      );
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
