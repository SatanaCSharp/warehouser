import type {
  AssignableWarehouseRole,
  Warehouse,
  WarehouseDeliveryAddress,
  WorkspaceContext,
  WorkspaceMember,
  WorkspacePermission,
  WorkspaceRole,
  WorkspaceUser,
} from '@warehouser/contracts/workspaces';
import {
  PermissionId,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { authBecameAuthenticated } from 'modules/auth/store/auth.slice';
import { warehousePath } from 'shared/api/warehouse/warehouse-path';
import type { AppStore } from 'store';
import { makeStore } from 'store';
import { vi } from 'vitest';

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
 * Central DC's own Delivery Address (AC-10) — one address and its access
 * notes, with no Main flag and no deactivation, because a Warehouse has
 * exactly one and corrects it in place.
 */
export const warehouseDeliveryAddress = (): WarehouseDeliveryAddress => ({
  warehouseId: warehouseIds.central,
  addressText: 'Am Kai 7, 21079 Hamburg',
  accessNotes: 'Yard entrance on Kaistrasse; deliveries 06:00-18:00',
});

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
  onSetWarehouseDeliveryAddress?: StubbedHandler;
  onTransferWorkspaceOwner?: StubbedHandler;
  onUpdateWorkspaceRole?: StubbedHandler;
  permissions?: WorkspacePermission[] | 'unavailable';
  roles?: WorkspaceRole[] | 'unavailable';
  users?: WorkspaceUser[];
  warehouseDeliveryAddress?: WarehouseDeliveryAddress;
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
      | 'warehouseDeliveryAddress'
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
/**
 * A read that either answers its dataset or refuses with the same safe error
 * envelope the Warehouse list already refuses with (`warehouses: 'unavailable'`
 * above). A permitted actor whose read fails must reach the surface's own error
 * arm rather than a false "empty", so every dataset a route loader settles
 * needs a way to fail in a spec.
 */
const answerRead = <TItem>(
  dataset: TItem[] | 'unavailable',
): Promise<Response> =>
  Promise.resolve(
    dataset === 'unavailable'
      ? Response.json(
          { code: 'api.unexpected', message: 'Unavailable' },
          { status: 500 },
        )
      : Response.json(dataset),
  );

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
    return answerRead(options.permissions);
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
    return answerRead(options.roles);
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

  // AC-10 — the Warehouse's own Delivery Address. Answered before the
  // catch-all rename branch below, which would otherwise swallow this path.
  if (url.includes('/delivery-address')) {
    if (method === 'PUT') {
      return answerWrite(options.onSetWarehouseDeliveryAddress, body, () =>
        Response.json({
          warehouseId: warehouseIds.central,
          addressText: 'Am Kai 9, 21079 Hamburg',
          accessNotes: 'Yard entrance on Kaistrasse; deliveries 06:00-18:00',
        }),
      );
    }
    return Promise.resolve(Response.json(options.warehouseDeliveryAddress));
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
    warehouseDeliveryAddress: warehouseDeliveryAddress(),
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

/**
 * T14 — the identifiers a Warehouse-address session needs. `foreignWorkspace`,
 * `nonExistent`, `ownWithoutMembership` and `malformed` are the four addresses
 * CR-AC-07 requires to be indistinguishable from one another; `north`, `south`
 * and `retired` are the memberships every entry verdict is resolved against.
 */
export const warehouseSessionIds = {
  actor: '00000000-0000-4000-8000-000000000150',
  foreignWorkspace: '00000000-0000-4000-8000-000000000155',
  malformed: 'not-a-warehouse-identifier',
  nonExistent: '00000000-0000-4000-8000-000000000156',
  north: '00000000-0000-4000-8000-000000000151',
  ownWithoutMembership: '00000000-0000-4000-8000-000000000154',
  retired: '00000000-0000-4000-8000-000000000153',
  role: '00000000-0000-4000-8000-000000000157',
  south: '00000000-0000-4000-8000-000000000152',
};

export type WarehouseMembershipFixture = {
  archivedAt: string | null;
  name: string;
  warehouseId: string;
};

/** Two live memberships and one archived — the shape T14's cases resolve against. */
export const warehouseMemberships = {
  north: {
    archivedAt: null,
    name: 'North Hub',
    warehouseId: warehouseSessionIds.north,
  },
  retired: {
    archivedAt: '2026-08-01T09:00:00.000Z',
    name: 'Old Depot',
    warehouseId: warehouseSessionIds.retired,
  },
  south: {
    archivedAt: null,
    name: 'South Cross-dock',
    warehouseId: warehouseSessionIds.south,
  },
} satisfies Record<string, WarehouseMembershipFixture>;

/**
 * The server's own derivation of the effective Warehouse, reproduced so a
 * revised context body stays a body the server could actually return: the
 * stored selection while it names a live non-archived membership, otherwise
 * the sole live membership when exactly one exists, otherwise null
 * (`change.md` §2.1; consumed unchanged by the web per CR-RG-04).
 */
const deriveEffectiveWarehouseId = (
  stored: string | null,
  memberships: readonly WarehouseMembershipFixture[],
): string | null => {
  const live = memberships.filter(
    (membership) => membership.archivedAt === null,
  );
  if (
    stored !== null &&
    live.some((membership) => membership.warehouseId === stored)
  ) {
    return stored;
  }
  return live.length === 1 ? live[0].warehouseId : null;
};

export type WarehouseSessionRequest = { method: string; url: string };

export type WarehouseSessionRevision = {
  /**
   * What the Workspace-context read answers with. A non-200 makes that read
   * FAIL, which is the state CR-AC-08 distinguishes from an absence of access:
   * the actor's access is unknown, so the route owes them a retryable error
   * rather than a refusal or the no-context state. Revisable, so a case can
   * fail the first read and answer the retry.
   */
  contextStatus?: number;
  effectiveWarehouseId?: string | null;
  memberships?: readonly WarehouseMembershipFixture[];
};

type WarehouseSessionOptions = WarehouseSessionRevision & {
  /**
   * What the stored-selection write answers. A non-2xx leaves the recorded
   * selection untouched, which is CR-AC-09's fire-and-forget failure and the
   * only way to hold a stored selection that disagrees with the open address.
   */
  activeWarehouseWriteStatus?: number;
  authenticated?: boolean;
  /** What the actor's Role carries in each Warehouse, keyed by its id. */
  permissionIdsIn?: Readonly<Record<string, readonly PermissionId[]>>;
  workspacePermissionIds?: readonly WorkspacePermissionId[];
};

export type WarehouseSessionStub = {
  /** Every request the session answered, in order, still filling as it runs. */
  readonly requests: readonly WarehouseSessionRequest[];
  /** Changes what the NEXT Workspace-context read answers (CR-AC-20). */
  reviseContext: (revision: WarehouseSessionRevision) => void;
  urlsMatching: (pattern: RegExp) => string[];
};

const asAccessPage = (items: unknown[]): Record<string, unknown> => ({
  hasNext: false,
  hasPrev: false,
  items,
  nextCursor: null,
});

/**
 * One Warehouse's four access reads, each at its own **exact** per-Warehouse
 * URL built by the production `warehousePath`. A request that forgets its
 * Warehouse, or names another one, 404s here exactly as it would against the
 * server — which is how a case proves the request named its Warehouse
 * (CR-RG-01).
 */
const warehouseAccessRoutes = (
  { archivedAt, name, warehouseId }: WarehouseMembershipFixture,
  permissionIds: readonly PermissionId[],
): [string, unknown][] => {
  const role = {
    assignedMemberCount: 1,
    id: warehouseSessionIds.role,
    kind: 'custom',
    name: `${name} Operators`,
    permissionIds: [...permissionIds],
  };
  return [
    [
      warehousePath(warehouseId, 'access/current'),
      {
        archivedAt,
        permissionIds: [...permissionIds],
        roleId: warehouseSessionIds.role,
        roleKind: 'custom',
        warehouseId,
      },
    ],
    [warehousePath(warehouseId, 'access/roles'), asAccessPage([role])],
    [
      warehousePath(warehouseId, 'access/permissions'),
      asAccessPage([
        {
          id: PermissionId.ROLES_WATCH,
          kind: 'assignable',
          label: 'View roles',
        },
      ]),
    ],
    [
      warehousePath(warehouseId, 'access/members'),
      asAccessPage([
        {
          email: `${name.toLowerCase().replace(/\W+/gu, '-')}@example.test`,
          roleId: warehouseSessionIds.role,
          roleKind: 'custom',
          userId: warehouseSessionIds.actor,
        },
      ]),
    ],
  ];
};

/**
 * T14 — answers a whole Warehouse-address session: the session restore, the
 * Workspace context, the stored-selection write, and each membership's own
 * access reads. The context body is re-read on every request, so
 * `reviseContext` changes what a **refetch** mid-session answers without
 * re-stubbing anything (CR-AC-20).
 */
export const stubWarehouseSession = ({
  activeWarehouseWriteStatus = 200,
  authenticated = true,
  contextStatus = 200,
  effectiveWarehouseId = null,
  memberships = [],
  permissionIdsIn = {},
  workspacePermissionIds = [],
}: WarehouseSessionOptions = {}): WarehouseSessionStub => {
  const requests: WarehouseSessionRequest[] = [];
  const state = { contextStatus, effectiveWarehouseId, memberships };

  const routes = (): [string, unknown][] => [
    [
      '/api/v1/workspace/context',
      {
        effectiveWarehouseId: state.effectiveWarehouseId,
        warehouses: state.memberships.map((membership) => ({
          ...membership,
          roleId: warehouseSessionIds.role,
          roleKind: 'custom',
        })),
        workspace: { id: workspaceIds.workspace, name: 'Acme Logistics' },
        workspacePermissionIds: [...workspacePermissionIds],
      },
    ],
    ...state.memberships.flatMap((membership) =>
      warehouseAccessRoutes(
        membership,
        permissionIdsIn[membership.warehouseId] ?? [],
      ),
    ),
  ];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = requestMethod(input, init);
      requests.push({ method, url });

      if (url === '/api/v1/auth/session') {
        return Promise.resolve(
          authenticated
            ? Response.json({ user: { id: warehouseSessionIds.actor } })
            : new Response(null, { status: 204 }),
        );
      }

      if (url === '/api/v1/workspace/context' && state.contextStatus !== 200) {
        return Promise.resolve(
          Response.json(
            { code: 'api.unexpected', message: 'Unavailable' },
            { status: state.contextStatus },
          ),
        );
      }

      if (url === '/api/v1/workspace/active-warehouse' && method === 'PUT') {
        if (activeWarehouseWriteStatus !== 200) {
          return Promise.resolve(
            Response.json(
              { code: 'api.unexpected', message: 'Unavailable' },
              { status: activeWarehouseWriteStatus },
            ),
          );
        }
        const body = jsonBody(init) as { warehouseId?: string } | undefined;
        state.effectiveWarehouseId = body?.warehouseId ?? null;
        return Promise.resolve(
          Response.json({ effectiveWarehouseId: state.effectiveWarehouseId }),
        );
      }

      const route = routes().find(([path]) => path === url);
      return Promise.resolve(
        route
          ? Response.json(route[1])
          : Response.json(
              { code: 'api.not_found', message: 'Not found' },
              { status: 404 },
            ),
      );
    }),
  );

  return {
    requests,
    reviseContext: (revision) => {
      Object.assign(state, revision);
      // The server derives `effectiveWarehouseId`; it is never a value the
      // client stores independently of the memberships beside it. A revision
      // that withdraws or archives the named membership must therefore move
      // the derived value too, or the fixture reports a body the server
      // cannot produce — a stored selection naming a Warehouse the actor holds
      // no live membership in — and hides every defect that only appears once
      // the two disagree the way they really do (CR-AC-20, change.md §2.1).
      if (revision.effectiveWarehouseId === undefined) {
        state.effectiveWarehouseId = deriveEffectiveWarehouseId(
          state.effectiveWarehouseId,
          state.memberships,
        );
      }
    },
    urlsMatching: (pattern) =>
      requests
        .filter((request) => pattern.test(request.url))
        .map((request) => request.url),
  };
};
