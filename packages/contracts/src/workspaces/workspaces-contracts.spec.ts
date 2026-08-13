// T6 — packages/contracts/src/workspaces request and response schemas (AC-32, AC-33).
//
// RED: the `workspaces` module does not exist yet. Every import below is expected to fail to
// resolve until the implementer adds `packages/contracts/src/workspaces/*` and the
// `@warehouser/shared-types` dependency this file also needs for the type-level AC-31 boundary
// check. This file is deliberately test-only: no production schema is created here.
//
// Field names, `required` and nullability below are copied verbatim from
// docs/features/workspaces/contracts/openapi.yaml `#/components/schemas/*` — see the header
// comment on each `describe` block for the exact component it asserts against.
import type {
  PermissionId,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import {
  PermissionId as PermissionIdConst,
  WorkspacePermissionId as WorkspacePermissionIdConst,
} from '@warehouser/shared-types/enums';
import type {
  WorkspaceContext,
  WorkspaceRole,
  WorkspaceRoleWrite,
} from 'workspaces';
import {
  activeWarehouseSelectionSchema,
  activeWarehouseWriteSchema,
  assignableWarehouseRoleSchema,
  contextWarehouseSchema,
  warehouseArchivalSchema,
  warehouseMembershipAssignmentSchema,
  warehouseMembershipSchema,
  warehouseSchema,
  warehouseWriteSchema,
  workspaceContextSchema,
  workspaceMemberAddSchema,
  workspaceMemberSchema,
  workspaceOwnerTransferResultSchema,
  workspaceOwnerTransferSchema,
  workspacePermissionSchema,
  workspaceRenameSchema,
  workspaceRoleAssignmentSchema,
  workspaceRoleDeletionSchema,
  workspaceRoleSchema,
  workspaceRoleWriteSchema,
  workspaceSchema,
  workspaceUserSchema,
  workspaceUserWarehouseSchema,
} from 'workspaces';

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const contextWarehouse = {
  warehouseId: id(10),
  name: 'Test Warehouse North',
  archivedAt: null,
  roleId: id(20),
  roleKind: 'warehouse_manager',
};

describe('actor-context projection — Workspace, WorkspaceContext, ContextWarehouse, ActiveWarehouseSelection (AC-32, AC-33)', () => {
  it('accepts the exact Workspace shape and rejects an unknown key (strict)', () => {
    expect(workspaceSchema.parse({ id: id(1), name: null })).toEqual({
      id: id(1),
      name: null,
    });
    expect(
      workspaceSchema.safeParse({ id: id(1), name: 'Test Workspace' }).success,
    ).toBe(true);
    expect(
      workspaceSchema.safeParse({ id: id(1), name: null, extra: true }).success,
    ).toBe(false);
    expect(workspaceSchema.safeParse({ name: null }).success).toBe(false);
  });

  it('accepts the exact WorkspaceContext shape and rejects an unknown key (strict)', () => {
    const valid = {
      workspace: { id: id(1), name: null },
      workspacePermissionIds: [WorkspacePermissionIdConst.WAREHOUSES_WATCH],
      warehouses: [contextWarehouse],
      effectiveWarehouseId: id(10),
    };

    expect(workspaceContextSchema.parse(valid)).toEqual(valid);
    expect(
      workspaceContextSchema.safeParse({
        ...valid,
        effectiveWarehouseId: null,
      }).success,
    ).toBe(true);
    expect(
      workspaceContextSchema.safeParse({ ...valid, workspaceId: id(1) })
        .success,
    ).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { warehouses: _warehouses, ...missingWarehouses } = valid;
    expect(workspaceContextSchema.safeParse(missingWarehouses).success).toBe(
      false,
    );
  });

  it('projects an empty workspacePermissionIds for a Warehouse Member who is no Workspace Member (AC-30)', () => {
    expect(
      workspaceContextSchema.safeParse({
        workspace: { id: id(1), name: 'Test Workspace' },
        workspacePermissionIds: [],
        warehouses: [contextWarehouse],
        effectiveWarehouseId: id(10),
      }).success,
    ).toBe(true);
  });

  it('accepts the exact ContextWarehouse shape, requires all five fields and rejects workspaceId (rule 4)', () => {
    expect(contextWarehouseSchema.parse(contextWarehouse)).toEqual(
      contextWarehouse,
    );
    expect(
      contextWarehouseSchema.safeParse({
        ...contextWarehouse,
        archivedAt: '2026-08-01T09:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      contextWarehouseSchema.safeParse({
        ...contextWarehouse,
        workspaceId: id(1),
      }).success,
    ).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { roleKind: _roleKind, ...missingRoleKind } = contextWarehouse;
    expect(contextWarehouseSchema.safeParse(missingRoleKind).success).toBe(
      false,
    );
  });

  it('accepts the exact ActiveWarehouseSelection shape and rejects an unknown key (strict)', () => {
    expect(
      activeWarehouseSelectionSchema.parse({ effectiveWarehouseId: id(10) }),
    ).toEqual({ effectiveWarehouseId: id(10) });
    expect(
      activeWarehouseSelectionSchema.safeParse({ effectiveWarehouseId: null })
        .success,
    ).toBe(true);
    expect(
      activeWarehouseSelectionSchema.safeParse({
        effectiveWarehouseId: id(10),
        roleId: id(20),
      }).success,
    ).toBe(false);
  });

  it('accepts the exact ActiveWarehouseWrite request shape and rejects an unknown key (strict)', () => {
    expect(activeWarehouseWriteSchema.parse({ warehouseId: id(10) })).toEqual({
      warehouseId: id(10),
    });
    expect(activeWarehouseWriteSchema.safeParse({}).success).toBe(false);
    expect(
      activeWarehouseWriteSchema.safeParse({
        warehouseId: id(10),
        workspaceId: id(1),
      }).success,
    ).toBe(false);
  });
});

describe('the Workspace record — WorkspaceRename', () => {
  it('accepts the exact WorkspaceRename request shape and rejects an unknown key (strict)', () => {
    expect(workspaceRenameSchema.parse({ name: 'Test Workspace' })).toEqual({
      name: 'Test Workspace',
    });
    expect(workspaceRenameSchema.safeParse({}).success).toBe(false);
    expect(
      workspaceRenameSchema.safeParse({
        name: 'Test Workspace',
        workspaceId: id(1),
      }).success,
    ).toBe(false);
  });
});

describe('Workspace Roles and the Workspace Permission catalogue — WorkspaceRole, WorkspacePermission (AC-32)', () => {
  it('accepts the exact WorkspaceRole shape, requires all five fields and rejects workspaceId (rule 4)', () => {
    const valid = {
      id: id(30),
      name: 'Site Administrator',
      kind: 'custom',
      workspacePermissionIds: [WorkspacePermissionIdConst.WAREHOUSES_WATCH],
      assignedMemberCount: 2,
    };

    expect(workspaceRoleSchema.parse(valid)).toEqual(valid);
    expect(
      workspaceRoleSchema.safeParse({ ...valid, kind: 'workspace_owner' })
        .success,
    ).toBe(true);
    expect(
      workspaceRoleSchema.safeParse({ ...valid, kind: 'not_a_kind' }).success,
    ).toBe(false);
    expect(
      workspaceRoleSchema.safeParse({ ...valid, workspaceId: id(1) }).success,
    ).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { assignedMemberCount: _count, ...missingCount } = valid;
    expect(workspaceRoleSchema.safeParse(missingCount).success).toBe(false);
  });

  it('accepts an empty WorkspaceRole Permission set (AC-14)', () => {
    expect(
      workspaceRoleSchema.safeParse({
        id: id(30),
        name: 'Site Administrator',
        kind: 'custom',
        workspacePermissionIds: [],
        assignedMemberCount: 0,
      }).success,
    ).toBe(true);
  });

  it('accepts the exact WorkspaceRoleWrite request shape, rejects an unknown key and rejects a Permission definition or label in place of a bare identifier (AC-18)', () => {
    const valid = {
      name: 'Site Administrator',
      workspacePermissionIds: [WorkspacePermissionIdConst.WAREHOUSES_WATCH],
    };

    expect(workspaceRoleWriteSchema.parse(valid)).toEqual(valid);
    expect(
      workspaceRoleWriteSchema.safeParse({
        ...valid,
        workspacePermissionIds: [],
      }).success,
    ).toBe(true);
    // Server-computed fields never round-trip through a request schema.
    expect(
      workspaceRoleWriteSchema.safeParse({
        ...valid,
        kind: 'custom',
      }).success,
    ).toBe(false);
    expect(
      workspaceRoleWriteSchema.safeParse({
        ...valid,
        assignedMemberCount: 3,
      }).success,
    ).toBe(false);
    // AC-18: no endpoint accepts a Workspace Permission definition or label mutation — only the
    // bare identifier is representable, never a { id, label, kind } object.
    expect(
      workspaceRoleWriteSchema.safeParse({
        name: 'Site Administrator',
        workspacePermissionIds: [
          {
            id: 'WAREHOUSES:WATCH',
            label: 'View Warehouses',
            kind: 'assignable',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('accepts the exact WorkspaceRoleDeletion request shape, treats replacementWorkspaceRoleId as optional and rejects an unknown key (strict)', () => {
    expect(workspaceRoleDeletionSchema.parse({})).toEqual({});
    expect(
      workspaceRoleDeletionSchema.parse({
        replacementWorkspaceRoleId: id(32),
      }),
    ).toEqual({ replacementWorkspaceRoleId: id(32) });
    expect(
      workspaceRoleDeletionSchema.safeParse({
        replacementWorkspaceRoleId: id(32),
        reason: 'only_custom_role',
      }).success,
    ).toBe(false);
  });

  it('accepts the exact WorkspaceRoleAssignment request shape and rejects an unknown key (strict)', () => {
    expect(
      workspaceRoleAssignmentSchema.parse({ workspaceRoleId: id(30) }),
    ).toEqual({ workspaceRoleId: id(30) });
    expect(workspaceRoleAssignmentSchema.safeParse({}).success).toBe(false);
    expect(
      workspaceRoleAssignmentSchema.safeParse({
        workspaceRoleId: id(30),
        workspaceRoleKind: 'custom',
      }).success,
    ).toBe(false);
  });

  it('accepts the exact WorkspacePermission catalogue shape and rejects an unknown key (strict)', () => {
    const valid = {
      id: WorkspacePermissionIdConst.WAREHOUSES_ARCHIVE,
      label: 'Archive and restore Warehouses',
      kind: 'assignable',
    };

    expect(workspacePermissionSchema.parse(valid)).toEqual(valid);
    expect(
      workspacePermissionSchema.safeParse({ ...valid, kind: 'reserved' })
        .success,
    ).toBe(true);
    expect(
      workspacePermissionSchema.safeParse({ ...valid, kind: 'invalid' })
        .success,
    ).toBe(false);
    expect(
      workspacePermissionSchema.safeParse({ ...valid, assignable: true })
        .success,
    ).toBe(false);
  });
});

describe('Workspace Members and the Workspace Users candidate list — WorkspaceMember, WorkspaceUser (AC-33)', () => {
  it('accepts the exact WorkspaceMember shape, treats email as optional and rejects an unknown key (strict)', () => {
    const valid = {
      userId: id(2),
      workspaceRoleId: id(31),
      workspaceRoleKind: 'workspace_owner',
    };

    expect(workspaceMemberSchema.parse(valid)).toEqual(valid);
    expect(
      workspaceMemberSchema.safeParse({
        ...valid,
        email: 'owner@example.test',
      }).success,
    ).toBe(true);
    expect(
      workspaceMemberSchema.safeParse({ ...valid, password: 'leaked' }).success,
    ).toBe(false);
  });

  it('accepts the exact WorkspaceMemberAdd request shape, rejects an unknown key and rejects a capability projection back as proof of authority (sad.md §7)', () => {
    const valid = { userId: id(3), workspaceRoleId: id(30) };

    expect(workspaceMemberAddSchema.parse(valid)).toEqual(valid);
    expect(workspaceMemberAddSchema.safeParse({}).success).toBe(false);
    expect(
      workspaceMemberAddSchema.safeParse({
        ...valid,
        workspacePermissionIds: [WorkspacePermissionIdConst.WAREHOUSES_WATCH],
      }).success,
    ).toBe(false);
  });

  it('accepts the exact WorkspaceUser shape, requires isWorkspaceMember and warehouses and rejects an unknown key (strict)', () => {
    const valid = {
      userId: id(3),
      isWorkspaceMember: true,
      warehouses: [{ warehouseId: id(10) }],
    };

    expect(workspaceUserSchema.parse(valid)).toEqual(valid);
    // AC-33/AC-31 — a Warehouse Role must never ride along on the
    // Workspace-level Users read; `strictObject` makes that a parse failure.
    expect(
      workspaceUserSchema.safeParse({
        ...valid,
        warehouses: [{ warehouseId: id(10), roleId: id(22) }],
      }).success,
    ).toBe(false);
    expect(
      workspaceUserSchema.safeParse({
        ...valid,
        warehouses: [{ warehouseId: id(10), roleKind: 'custom' }],
      }).success,
    ).toBe(false);
    expect(
      workspaceUserSchema.safeParse({
        ...valid,
        email: 'admin@example.test',
      }).success,
    ).toBe(true);
    expect(
      workspaceUserSchema.safeParse({
        ...valid,
        isWorkspaceMember: false,
        warehouses: [],
      }).success,
    ).toBe(true);
    expect(
      workspaceUserSchema.safeParse({ ...valid, workspaceId: id(1) }).success,
    ).toBe(false);
  });

  it('accepts the exact WorkspaceUserWarehouse shape, carries no Warehouse Role and rejects an unknown key (strict)', () => {
    const valid = { warehouseId: id(10) };

    expect(workspaceUserWarehouseSchema.parse(valid)).toEqual(valid);
    expect(
      workspaceUserWarehouseSchema.safeParse({ ...valid, name: 'North' })
        .success,
    ).toBe(false);
    // AC-33/AC-31 — WORKSPACE_MEMBERS:WATCH does not cover a User's Warehouse
    // Role, so the level boundary is enforced by the schema, not by convention
    // (api-sync-report.md F-5).
    expect(
      workspaceUserWarehouseSchema.safeParse({ ...valid, roleId: id(22) })
        .success,
    ).toBe(false);
    expect(
      workspaceUserWarehouseSchema.safeParse({ ...valid, roleKind: 'custom' })
        .success,
    ).toBe(false);
  });
});

describe('Owner transfer — WorkspaceOwnerTransfer, WorkspaceOwnerTransferResult', () => {
  it('accepts the exact WorkspaceOwnerTransfer request shape, rejects an unknown key and rejects the response shape leaking into the request', () => {
    const valid = {
      recipientUserId: id(3),
      formerOwnerWorkspaceRoleId: id(30),
    };

    expect(workspaceOwnerTransferSchema.parse(valid)).toEqual(valid);
    expect(
      workspaceOwnerTransferSchema.safeParse({
        ...valid,
        ownerUserId: id(3),
      }).success,
    ).toBe(false);
  });

  it('accepts the exact WorkspaceOwnerTransferResult shape and rejects an unknown key (strict)', () => {
    const valid = {
      ownerUserId: id(3),
      formerOwnerUserId: id(2),
      formerOwnerWorkspaceRoleId: id(30),
    };

    expect(workspaceOwnerTransferResultSchema.parse(valid)).toEqual(valid);
    expect(
      workspaceOwnerTransferResultSchema.safeParse({
        ...valid,
        recipientUserId: id(3),
      }).success,
    ).toBe(false);
  });
});

describe('Warehouse records and membership edges — Warehouse, AssignableWarehouseRole (AC-33)', () => {
  it('accepts the exact Warehouse shape, requires archivedAt and rejects workspaceId (rule 4)', () => {
    const valid = {
      id: id(10),
      name: 'Test Warehouse North',
      archivedAt: null,
    };

    expect(warehouseSchema.parse(valid)).toEqual(valid);
    expect(
      warehouseSchema.safeParse({
        ...valid,
        archivedAt: '2026-08-01T09:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      warehouseSchema.safeParse({ ...valid, workspaceId: id(1) }).success,
    ).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { archivedAt: _archivedAt, ...missingArchivedAt } = valid;
    expect(warehouseSchema.safeParse(missingArchivedAt).success).toBe(false);
  });

  it('accepts the exact WarehouseWrite request shape and rejects server-computed fields', () => {
    expect(
      warehouseWriteSchema.parse({ name: 'Test Warehouse North' }),
    ).toEqual({ name: 'Test Warehouse North' });
    expect(
      warehouseWriteSchema.safeParse({
        name: 'Test Warehouse North',
        archivedAt: null,
      }).success,
    ).toBe(false);
  });

  it('accepts the exact WarehouseArchival request shape and rejects an unknown key (strict)', () => {
    expect(warehouseArchivalSchema.parse({ archived: true })).toEqual({
      archived: true,
    });
    expect(warehouseArchivalSchema.safeParse({}).success).toBe(false);
    expect(
      warehouseArchivalSchema.safeParse({ archived: true, reason: 'x' })
        .success,
    ).toBe(false);
  });

  it('accepts only the identifier and name of an AssignableWarehouseRole, never a Permission set (AC-23a)', () => {
    const valid = { id: id(22), name: 'Picker' };

    expect(assignableWarehouseRoleSchema.parse(valid)).toEqual(valid);
    expect(
      assignableWarehouseRoleSchema.safeParse({
        ...valid,
        permissionIds: ['ROLES:WATCH'],
      }).success,
    ).toBe(false);
    expect(
      assignableWarehouseRoleSchema.safeParse({
        ...valid,
        assignedMemberCount: 0,
      }).success,
    ).toBe(false);
  });

  it('accepts the exact WarehouseMembershipAssignment request shape, rejects an unknown key and never carries warehouseId (it is a path parameter)', () => {
    const valid = { userId: id(4), roleId: id(22) };

    expect(warehouseMembershipAssignmentSchema.parse(valid)).toEqual(valid);
    expect(
      warehouseMembershipAssignmentSchema.safeParse({
        ...valid,
        warehouseId: id(10),
      }).success,
    ).toBe(false);
    expect(
      warehouseMembershipAssignmentSchema.safeParse({
        ...valid,
        workspaceId: id(1),
      }).success,
    ).toBe(false);
  });

  it('accepts the exact WarehouseMembership response shape, is the one Workspace-scoped schema that legitimately carries warehouseId, and rejects workspaceId', () => {
    const valid = {
      userId: id(4),
      warehouseId: id(10),
      roleId: id(22),
      roleKind: 'custom',
    };

    expect(warehouseMembershipSchema.parse(valid)).toEqual(valid);
    expect(
      warehouseMembershipSchema.safeParse({ ...valid, workspaceId: id(1) })
        .success,
    ).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { warehouseId: _warehouseId, ...missingWarehouseId } = valid;
    expect(
      warehouseMembershipSchema.safeParse(missingWarehouseId).success,
    ).toBe(false);
  });
});

describe('AC-31 compile boundary — every Workspace Permission field is typed to WorkspacePermissionId, never PermissionId', () => {
  it('types WorkspaceRoleWrite.workspacePermissionIds as WorkspacePermissionId, not PermissionId (type-level)', () => {
    const legal: WorkspaceRoleWrite['workspacePermissionIds'] = [
      WorkspacePermissionIdConst.WORKSPACE_RENAME,
    ];

    // @ts-expect-error a Warehouse `PermissionId` must never satisfy a `WorkspacePermissionId`
    // field — AC-31's level confusion must be a compile error, not a runtime authorization hole.
    const illegal: WorkspaceRoleWrite['workspacePermissionIds'][number] =
      PermissionIdConst.USERS_CREATE;

    expect(Array.isArray(legal)).toBe(true);
    expect(typeof illegal).toBe('string');
  });

  it('types WorkspaceRole.workspacePermissionIds and WorkspaceContext.workspacePermissionIds the same way (type-level)', () => {
    const roleIds: WorkspaceRole['workspacePermissionIds'] = [
      WorkspacePermissionIdConst.WAREHOUSES_WATCH,
    ];
    const contextIds: WorkspaceContext['workspacePermissionIds'] = [
      WorkspacePermissionIdConst.WAREHOUSES_WATCH,
    ];

    // @ts-expect-error same boundary as above, exercised against the response projections rather
    // than the request write schema.
    const illegalRoleId: WorkspaceRole['workspacePermissionIds'][number] =
      PermissionIdConst.ROLES_WATCH;
    // @ts-expect-error same boundary as above, exercised against WorkspaceContext.
    const illegalContextId: WorkspaceContext['workspacePermissionIds'][number] =
      PermissionIdConst.ROLES_WATCH;

    expect(roleIds).toHaveLength(1);
    expect(contextIds).toHaveLength(1);
    expect(typeof illegalRoleId).toBe('string');
    expect(typeof illegalContextId).toBe('string');
  });

  it('confirms a genuine WorkspacePermissionId still validates at runtime (the runtime half of the boundary)', () => {
    const value: WorkspacePermissionId =
      WorkspacePermissionIdConst.WAREHOUSES_WATCH;
    const other: PermissionId = PermissionIdConst.ROLES_WATCH;

    expect(
      workspaceRoleWriteSchema.safeParse({
        name: 'Site Administrator',
        workspacePermissionIds: [value],
      }).success,
    ).toBe(true);
    expect(
      workspaceRoleWriteSchema.safeParse({
        name: 'Site Administrator',
        workspacePermissionIds: [other],
      }).success,
    ).toBe(false);
  });
});
