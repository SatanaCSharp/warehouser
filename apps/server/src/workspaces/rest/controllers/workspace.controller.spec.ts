import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import type { WorkspaceAccessRequest } from 'shared/access/access-request';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator';
import { REQUIRED_WORKSPACE_PERMISSION_KEY } from 'shared/decorators/required-workspace-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WorkspaceAccessGuard } from 'shared/guards/workspace-access.guard';
import { WorkspaceController } from 'workspaces/rest/controllers/workspace.controller';
import type { AddWorkspaceMemberCommand } from 'workspaces/usecases/commands/add-workspace-member.command';
import type { AssignWorkspaceRoleCommand } from 'workspaces/usecases/commands/assign-workspace-role.command';
import type { CreateWorkspaceRoleCommand } from 'workspaces/usecases/commands/create-workspace-role.command';
import type { DeleteWorkspaceRoleCommand } from 'workspaces/usecases/commands/delete-workspace-role.command';
import type { RemoveWorkspaceMemberCommand } from 'workspaces/usecases/commands/remove-workspace-member.command';
import type { RenameWorkspaceCommand } from 'workspaces/usecases/commands/rename-workspace.command';
import type { SetActiveWarehouseCommand } from 'workspaces/usecases/commands/set-active-warehouse.command';
import type { TransferWorkspaceOwnerCommand } from 'workspaces/usecases/commands/transfer-workspace-owner.command';
import type { UpdateWorkspaceRoleCommand } from 'workspaces/usecases/commands/update-workspace-role.command';
import type { ListWorkspaceMembersQuery } from 'workspaces/usecases/queries/list-workspace-members.query';
import type { ListWorkspacePermissionsQuery } from 'workspaces/usecases/queries/list-workspace-permissions.query';
import type { ListWorkspaceRolesQuery } from 'workspaces/usecases/queries/list-workspace-roles.query';
import type { ListWorkspaceUsersQuery } from 'workspaces/usecases/queries/list-workspace-users.query';
import type { ReadWorkspaceContextQuery } from 'workspaces/usecases/queries/read-workspace-context.query';

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const actorId = id(1);
const workspaceId = id(2);
const roleId = id(3);

const request = (
  permissionId: WorkspacePermissionId,
): WorkspaceAccessRequest => ({
  headers: {},
  user: { userId: actorId },
  workspace: {
    userId: actorId,
    workspaceId,
    workspaceRoleId: roleId,
    workspaceRoleKind: 'custom',
    permissionId,
  },
});

const sessionOnlyRequest = (): WorkspaceAccessRequest => ({
  headers: {},
  user: { userId: actorId },
});

const method = (name: keyof WorkspaceController): object =>
  Object.getOwnPropertyDescriptor(WorkspaceController.prototype, name)
    ?.value as object;

// eslint-disable-next-line max-lines-per-function, max-statements -- one suite per controller, with one use-case double per route
describe('WorkspaceController', () => {
  const context = {
    execute: jest.fn(),
  } as unknown as ReadWorkspaceContextQuery;
  const listRoles = {
    execute: jest.fn(),
  } as unknown as ListWorkspaceRolesQuery;
  const listPermissions = {
    execute: jest.fn(),
  } as unknown as ListWorkspacePermissionsQuery;
  const listMembers = {
    execute: jest.fn(),
  } as unknown as ListWorkspaceMembersQuery;
  const listUsers = {
    execute: jest.fn(),
  } as unknown as ListWorkspaceUsersQuery;
  const rename = { execute: jest.fn() } as unknown as RenameWorkspaceCommand;
  const createRole = {
    execute: jest.fn(),
  } as unknown as CreateWorkspaceRoleCommand;
  const updateRole = {
    execute: jest.fn(),
  } as unknown as UpdateWorkspaceRoleCommand;
  const deleteRole = {
    execute: jest.fn(),
  } as unknown as DeleteWorkspaceRoleCommand;
  const addMember = {
    execute: jest.fn(),
  } as unknown as AddWorkspaceMemberCommand;
  const removeMember = {
    execute: jest.fn(),
  } as unknown as RemoveWorkspaceMemberCommand;
  const assignRole = {
    execute: jest.fn(),
  } as unknown as AssignWorkspaceRoleCommand;
  const transferOwner = {
    execute: jest.fn(),
  } as unknown as TransferWorkspaceOwnerCommand;
  const setActiveWarehouse = {
    execute: jest.fn(),
  } as unknown as SetActiveWarehouseCommand;

  const controller = new WorkspaceController(
    context,
    listRoles,
    listPermissions,
    listMembers,
    listUsers,
    rename,
    createRole,
    updateRole,
    deleteRole,
    addMember,
    removeMember,
    assignRole,
    transferOwner,
    setActiveWarehouse,
  );

  beforeEach(() => jest.clearAllMocks());

  it('exposes every Workspace-scoped path of openapi.yaml under one prefix', () => {
    expect(Reflect.getMetadata(PATH_METADATA, WorkspaceController)).toBe(
      'api/v1/workspace',
    );
    expect([
      [
        Reflect.getMetadata(PATH_METADATA, method('readContext')),
        Reflect.getMetadata(METHOD_METADATA, method('readContext')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('setActiveWarehouse')),
        Reflect.getMetadata(METHOD_METADATA, method('setActiveWarehouse')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('renameWorkspace')),
        Reflect.getMetadata(METHOD_METADATA, method('renameWorkspace')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('listRoles')),
        Reflect.getMetadata(METHOD_METADATA, method('listRoles')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('createRole')),
        Reflect.getMetadata(METHOD_METADATA, method('createRole')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('updateRole')),
        Reflect.getMetadata(METHOD_METADATA, method('updateRole')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('deleteRole')),
        Reflect.getMetadata(METHOD_METADATA, method('deleteRole')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('listPermissions')),
        Reflect.getMetadata(METHOD_METADATA, method('listPermissions')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('listMembers')),
        Reflect.getMetadata(METHOD_METADATA, method('listMembers')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('addMember')),
        Reflect.getMetadata(METHOD_METADATA, method('addMember')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('removeMember')),
        Reflect.getMetadata(METHOD_METADATA, method('removeMember')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('assignMemberRole')),
        Reflect.getMetadata(METHOD_METADATA, method('assignMemberRole')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('transferOwner')),
        Reflect.getMetadata(METHOD_METADATA, method('transferOwner')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('listUsers')),
        Reflect.getMetadata(METHOD_METADATA, method('listUsers')),
      ],
    ]).toEqual([
      ['context', RequestMethod.GET],
      ['active-warehouse', RequestMethod.PUT],
      ['/', RequestMethod.PATCH],
      ['roles', RequestMethod.GET],
      ['roles', RequestMethod.POST],
      ['roles/:workspaceRoleId', RequestMethod.PATCH],
      ['roles/:workspaceRoleId', RequestMethod.DELETE],
      ['permissions', RequestMethod.GET],
      ['members', RequestMethod.GET],
      ['members', RequestMethod.POST],
      ['members/:userId', RequestMethod.DELETE],
      ['members/:userId/role', RequestMethod.PUT],
      ['owner-transfer', RequestMethod.POST],
      ['users', RequestMethod.GET],
    ]);
  });

  // sad.md §8 class 1 — every protected handler declares a Workspace
  // Permission and is resolved by the Workspace guard.
  it.each([
    ['renameWorkspace', WorkspacePermissionId.WORKSPACE_RENAME],
    ['listRoles', WorkspacePermissionId.WORKSPACE_ROLES_WATCH],
    ['createRole', WorkspacePermissionId.WORKSPACE_ROLES_CREATE],
    ['updateRole', WorkspacePermissionId.WORKSPACE_ROLES_UPDATE],
    ['deleteRole', WorkspacePermissionId.WORKSPACE_ROLES_DELETE],
    ['listPermissions', WorkspacePermissionId.WORKSPACE_ROLES_WATCH],
    ['listMembers', WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH],
    ['addMember', WorkspacePermissionId.WORKSPACE_MEMBERS_ADD],
    ['removeMember', WorkspacePermissionId.WORKSPACE_MEMBERS_REMOVE],
    ['assignMemberRole', WorkspacePermissionId.WORKSPACE_ROLES_ASSIGN],
    ['transferOwner', WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN],
    ['listUsers', WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH],
  ] as const)('%s declares its Workspace Permission', (name, permissionId) => {
    expect(
      Reflect.getMetadata(REQUIRED_WORKSPACE_PERMISSION_KEY, method(name)),
    ).toEqual([permissionId]);
    expect(Reflect.getMetadata(GUARDS_METADATA, method(name))).toEqual([
      SessionAuthGuard,
      WorkspaceAccessGuard,
    ]);
  });

  // AC-30/AC-31 — a Warehouse Permission declared on this surface resolves
  // nothing, because no handler here is behind the Warehouse guard: the
  // Workspace guard reads a different metadata key entirely and denies when
  // its own key is absent.
  it.each([
    'readContext',
    'setActiveWarehouse',
    'renameWorkspace',
    'listRoles',
    'createRole',
    'updateRole',
    'deleteRole',
    'listPermissions',
    'listMembers',
    'addMember',
    'removeMember',
    'assignMemberRole',
    'transferOwner',
    'listUsers',
  ] as const)('%s declares no Warehouse Permission', (name) => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION_KEY, method(name)),
    ).toBeUndefined();
  });

  // sad.md §8 class 5 — the self-projection read, and class 4 — the single
  // session-only-with-a-documented-membership-check route.
  it.each(['readContext', 'setActiveWarehouse'] as const)(
    '%s is session-only and declares no Workspace Permission',
    (name) => {
      expect(
        Reflect.getMetadata(REQUIRED_WORKSPACE_PERMISSION_KEY, method(name)),
      ).toBeUndefined();
      expect(Reflect.getMetadata(GUARDS_METADATA, method(name))).toEqual([
        SessionAuthGuard,
      ]);
    },
  );

  // AC-30 — the empty projection a User who is no Workspace Member at all
  // receives is what makes the web omit every Workspace control.
  it('answers the actor context for a User who is no Workspace Member', async () => {
    jest.mocked(context.execute).mockResolvedValue({
      workspace: { id: workspaceId, name: 'Test Workspace' },
      workspacePermissionIds: [],
      warehouses: [
        {
          warehouseId: id(10),
          name: 'Test Warehouse North',
          archivedAt: null,
          roleId: id(20),
          roleKind: 'custom',
        },
      ],
      effectiveWarehouseId: id(10),
    });

    await expect(controller.readContext(sessionOnlyRequest())).resolves.toEqual(
      {
        workspace: { id: workspaceId, name: 'Test Workspace' },
        workspacePermissionIds: [],
        warehouses: [
          {
            warehouseId: id(10),
            name: 'Test Warehouse North',
            archivedAt: null,
            roleId: id(20),
            roleKind: 'custom',
          },
        ],
        effectiveWarehouseId: id(10),
      },
    );
    expect(context.execute).toHaveBeenCalledWith(actorId);
  });

  it('renders the archived state of a context Warehouse as a contract timestamp', async () => {
    jest.mocked(context.execute).mockResolvedValue({
      workspace: { id: workspaceId, name: null },
      workspacePermissionIds: [WorkspacePermissionId.WAREHOUSES_WATCH],
      warehouses: [
        {
          warehouseId: id(11),
          name: 'Test Warehouse South',
          archivedAt: new Date('2026-08-01T09:00:00.000Z'),
          roleId: id(21),
          roleKind: 'custom',
        },
      ],
      effectiveWarehouseId: null,
    });

    await expect(
      controller.readContext(sessionOnlyRequest()),
    ).resolves.toMatchObject({
      warehouses: [
        expect.objectContaining({ archivedAt: '2026-08-01T09:00:00.000Z' }),
      ],
    });
  });

  it('delegates the selection to the command that proves the membership', async () => {
    jest
      .mocked(setActiveWarehouse.execute)
      .mockResolvedValue({ effectiveWarehouseId: id(10) });

    await expect(
      controller.setActiveWarehouse(sessionOnlyRequest(), {
        warehouseId: id(10),
      }),
    ).resolves.toEqual({ effectiveWarehouseId: id(10) });
    expect(setActiveWarehouse.execute).toHaveBeenCalledWith(actorId, {
      warehouseId: id(10),
    });
  });

  it('delegates the Workspace rename and returns the renamed Workspace', async () => {
    jest
      .mocked(rename.execute)
      .mockResolvedValue({ id: workspaceId, name: 'Test Workspace' });

    await expect(
      controller.renameWorkspace(
        request(WorkspacePermissionId.WORKSPACE_RENAME),
        { name: 'Test Workspace' },
      ),
    ).resolves.toEqual({ id: workspaceId, name: 'Test Workspace' });
    expect(rename.execute).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      { name: 'Test Workspace' },
    );
  });

  it.each([
    ['listRoles', listRoles, WorkspacePermissionId.WORKSPACE_ROLES_WATCH],
    ['listMembers', listMembers, WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH],
    ['listUsers', listUsers, WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH],
  ] as const)(
    '%s scopes its query to the guard-derived Workspace principal',
    async (name, query, permissionId) => {
      jest.mocked(query.execute).mockResolvedValue([]);

      await expect(controller[name](request(permissionId))).resolves.toEqual(
        [],
      );
      expect(query.execute).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId }),
      );
    },
  );

  it('returns the Workspace Roles of the actor Workspace', async () => {
    jest.mocked(listRoles.execute).mockResolvedValue([
      {
        id: roleId,
        workspaceId,
        name: 'Site Administrator',
        kind: 'custom',
        permissionIds: [WorkspacePermissionId.WAREHOUSES_WATCH],
      },
    ]);

    await expect(
      controller.listRoles(
        request(WorkspacePermissionId.WORKSPACE_ROLES_WATCH),
      ),
    ).resolves.toEqual([
      {
        id: roleId,
        name: 'Site Administrator',
        kind: 'custom',
        workspacePermissionIds: [WorkspacePermissionId.WAREHOUSES_WATCH],
      },
    ]);
  });

  it('returns the system Workspace Permission catalogue whole', async () => {
    jest.mocked(listPermissions.execute).mockResolvedValue([
      {
        id: WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN,
        label: 'Transfer Workspace Owner',
        kind: 'reserved',
      },
    ]);

    await expect(controller.listPermissions()).resolves.toEqual([
      {
        id: WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN,
        label: 'Transfer Workspace Owner',
        kind: 'reserved',
      },
    ]);
    expect(listPermissions.execute).toHaveBeenCalledWith();
  });

  it('returns the Workspace Members with their Workspace Role assignment', async () => {
    jest.mocked(listMembers.execute).mockResolvedValue([
      {
        userId: id(4),
        workspaceRoleId: roleId,
        workspaceRoleName: 'Site Administrator',
        workspaceRoleKind: 'custom',
      },
    ]);

    await expect(
      controller.listMembers(
        request(WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH),
      ),
    ).resolves.toEqual([
      { userId: id(4), workspaceRoleId: roleId, workspaceRoleKind: 'custom' },
    ]);
  });

  it('returns the Users of the Workspace with the Warehouses each belongs to', async () => {
    jest
      .mocked(listUsers.execute)
      .mockResolvedValue([{ userId: id(4), warehouseIds: [id(10)] }]);

    await expect(
      controller.listUsers(
        request(WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH),
      ),
    ).resolves.toEqual([
      { userId: id(4), warehouses: [{ warehouseId: id(10) }] },
    ]);
  });

  it('completes a created Workspace Role with its provable kind and member count', async () => {
    jest.mocked(createRole.execute).mockResolvedValue({
      id: roleId,
      name: 'Site Administrator',
      permissionIds: [WorkspacePermissionId.WAREHOUSES_WATCH],
    });

    await expect(
      controller.createRole(
        request(WorkspacePermissionId.WORKSPACE_ROLES_CREATE),
        {
          name: 'Site Administrator',
          workspacePermissionIds: [WorkspacePermissionId.WAREHOUSES_WATCH],
        },
      ),
    ).resolves.toEqual({
      id: roleId,
      name: 'Site Administrator',
      kind: 'custom',
      workspacePermissionIds: [WorkspacePermissionId.WAREHOUSES_WATCH],
      assignedMemberCount: 0,
    });
    expect(createRole.execute).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      {
        name: 'Site Administrator',
        permissionIds: [WorkspacePermissionId.WAREHOUSES_WATCH],
      },
    );
  });

  it('passes the Workspace Role identifier of the path to the update command', async () => {
    jest.mocked(updateRole.execute).mockResolvedValue({
      id: roleId,
      name: 'Site Administrator',
      permissionIds: [],
    });

    await expect(
      controller.updateRole(
        roleId,
        request(WorkspacePermissionId.WORKSPACE_ROLES_UPDATE),
        { name: 'Site Administrator', workspacePermissionIds: [] },
      ),
    ).resolves.toEqual({
      id: roleId,
      name: 'Site Administrator',
      kind: 'custom',
      workspacePermissionIds: [],
    });
    expect(updateRole.execute).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      { roleId, name: 'Site Administrator', permissionIds: [] },
    );
  });

  it('forwards the optional replacement Workspace Role of a deletion', async () => {
    jest.mocked(deleteRole.execute).mockResolvedValue({ id: roleId });

    await expect(
      controller.deleteRole(
        roleId,
        request(WorkspacePermissionId.WORKSPACE_ROLES_DELETE),
        { replacementWorkspaceRoleId: id(5) },
      ),
    ).resolves.toBeUndefined();
    expect(deleteRole.execute).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      { roleId, replacementRoleId: id(5) },
    );

    await controller.deleteRole(
      roleId,
      request(WorkspacePermissionId.WORKSPACE_ROLES_DELETE),
    );
    expect(deleteRole.execute).toHaveBeenLastCalledWith(
      expect.objectContaining({ workspaceId }),
      { roleId, replacementRoleId: undefined },
    );
  });

  it('completes an added Workspace Member with its provable Workspace Role kind', async () => {
    jest
      .mocked(addMember.execute)
      .mockResolvedValue({ userId: id(4), workspaceRoleId: roleId });

    await expect(
      controller.addMember(
        request(WorkspacePermissionId.WORKSPACE_MEMBERS_ADD),
        { userId: id(4), workspaceRoleId: roleId },
      ),
    ).resolves.toEqual({
      userId: id(4),
      workspaceRoleId: roleId,
      workspaceRoleKind: 'custom',
    });
    expect(addMember.execute).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      { candidateUserId: id(4), workspaceRoleId: roleId },
    );
  });

  it('delegates Workspace membership removal and returns no content', async () => {
    jest.mocked(removeMember.execute).mockResolvedValue({ userId: id(4) });

    await expect(
      controller.removeMember(
        id(4),
        request(WorkspacePermissionId.WORKSPACE_MEMBERS_REMOVE),
      ),
    ).resolves.toBeUndefined();
    expect(removeMember.execute).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      { targetUserId: id(4) },
    );
  });

  it('delegates a Workspace Role reassignment for the path User', async () => {
    jest
      .mocked(assignRole.execute)
      .mockResolvedValue({ userId: id(4), workspaceRoleId: roleId });

    await expect(
      controller.assignMemberRole(
        id(4),
        request(WorkspacePermissionId.WORKSPACE_ROLES_ASSIGN),
        { workspaceRoleId: roleId },
      ),
    ).resolves.toEqual({
      userId: id(4),
      workspaceRoleId: roleId,
      workspaceRoleKind: 'custom',
    });
    expect(assignRole.execute).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      { targetUserId: id(4), workspaceRoleId: roleId },
    );
  });

  it('reports the Owner transfer outcome from the actor and the command', async () => {
    jest.mocked(transferOwner.execute).mockResolvedValue({ ownerId: id(4) });

    await expect(
      controller.transferOwner(
        request(WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN),
        { recipientUserId: id(4), formerOwnerWorkspaceRoleId: roleId },
      ),
    ).resolves.toEqual({
      ownerUserId: id(4),
      formerOwnerUserId: actorId,
      formerOwnerWorkspaceRoleId: roleId,
    });
    expect(transferOwner.execute).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      { recipientUserId: id(4), currentOwnerReplacementRoleId: roleId },
    );
  });

  // AC-34 — a cross-Workspace target is refused by the use case with the same
  // non-enumerating failure as a missing one, and the controller neither
  // catches it nor translates it: the universal filter is the only boundary
  // that turns it into a response (server-error-handling.md §5).
  it.each([
    [
      'updateRole',
      (): Promise<unknown> =>
        controller.updateRole(
          id(9),
          request(WorkspacePermissionId.WORKSPACE_ROLES_UPDATE),
          { name: 'Other', workspacePermissionIds: [] },
        ),
      updateRole,
    ],
    [
      'deleteRole',
      (): Promise<unknown> =>
        controller.deleteRole(
          id(9),
          request(WorkspacePermissionId.WORKSPACE_ROLES_DELETE),
        ),
      deleteRole,
    ],
    [
      'removeMember',
      (): Promise<unknown> =>
        controller.removeMember(
          id(9),
          request(WorkspacePermissionId.WORKSPACE_MEMBERS_REMOVE),
        ),
      removeMember,
    ],
    [
      'assignMemberRole',
      (): Promise<unknown> =>
        controller.assignMemberRole(
          id(9),
          request(WorkspacePermissionId.WORKSPACE_ROLES_ASSIGN),
          { workspaceRoleId: roleId },
        ),
      assignRole,
    ],
    [
      'addMember',
      (): Promise<unknown> =>
        controller.addMember(
          request(WorkspacePermissionId.WORKSPACE_MEMBERS_ADD),
          { userId: id(9), workspaceRoleId: roleId },
        ),
      addMember,
    ],
    [
      'transferOwner',
      (): Promise<unknown> =>
        controller.transferOwner(
          request(WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN),
          { recipientUserId: id(9), formerOwnerWorkspaceRoleId: roleId },
        ),
      transferOwner,
    ],
    [
      'setActiveWarehouse',
      (): Promise<unknown> =>
        controller.setActiveWarehouse(sessionOnlyRequest(), {
          warehouseId: id(9),
        }),
      setActiveWarehouse,
    ],
  ] as const)(
    '%s propagates the non-enumerating cross-Workspace failure unchanged',
    async (_name, invoke, usecase) => {
      const failure = new ApplicationError(
        ErrorCode.WORKSPACE_TARGET_UNAVAILABLE,
      );
      jest.mocked(usecase.execute).mockRejectedValue(failure);

      await expect(invoke()).rejects.toBe(failure);
    },
  );

  it('uses the specified mutation success statuses', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, method('createRole'))).toBe(
      201,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, method('addMember'))).toBe(
      201,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, method('deleteRole'))).toBe(
      204,
    );
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, method('removeMember')),
    ).toBe(204);
  });

  // DoD — no controller on this surface contains business logic: it reaches
  // only use cases, never a repository, a domain service or persistence.
  it('reaches use cases only, never a repository, service or persistence', () => {
    const source = readFileSync(
      join(__dirname, 'workspace.controller.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/from\s+['"]shared\/domain\/repositories\//u);
    expect(source).not.toMatch(/from\s+['"]shared\/domain\/entities\//u);
    expect(source).not.toMatch(/from\s+['"]workspaces\/domain\//u);
    expect(source).not.toMatch(/from\s+['"]typeorm['"]/u);
    expect(source).not.toMatch(/\btry\s*\{/u);
  });
});
