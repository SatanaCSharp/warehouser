import { Test } from '@nestjs/testing';
import { ErrorCode, PermissionId } from '@warehouser/shared-types/enums';
import { CreateRoleCommand } from 'access/usecases/commands/create-role.command';
import { UpdateRoleCommand } from 'access/usecases/commands/update-role.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import {
  TRANSACTIONAL_KEY,
  type TransactionalMetadata,
} from 'shared/decorators/transactional.decorator';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const roleId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000003';

const currentUser = (
  permissionId: AccessCurrentUser['permissionId'],
): AccessCurrentUser => ({
  userId: actorId,
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000004',
  roleKind: 'custom',
  permissionId,
});

const repositoryDouble = () => ({
  createCustomRole: jest.fn().mockResolvedValue(undefined),
  findAssignablePermissions: jest
    .fn()
    .mockImplementation((permissionIds: readonly string[]) =>
      Promise.resolve(permissionIds.map((id) => ({ id }))),
    ),
  lockWarehouse: jest.fn().mockResolvedValue({ id: warehouseId }),
  lockCustomRole: jest.fn().mockResolvedValue({ id: roleId, kind: 'custom' }),
  findRoleByName: jest.fn().mockResolvedValue(null),
  updateCustomRole: jest.fn().mockResolvedValue(undefined),
  replaceCustomRolePermissions: jest.fn().mockResolvedValue(undefined),
});

describe('custom Role lifecycle commands', () => {
  it('constructs role creation through Nest without a test-only runtime provider', async () => {
    const module = await Test.createTestingModule({
      providers: [
        CreateRoleCommand,
        { provide: RoleLifecycleRepository, useValue: repositoryDouble() },
      ],
    }).compile();

    expect(module.get(CreateRoleCommand)).toBeInstanceOf(CreateRoleCommand);
  });

  it('creates a Warehouse-scoped Role with trimmed Unicode and assignable Permissions', async () => {
    const repository = repositoryDouble();
    const command = new CreateRoleCommand(
      repository as unknown as RoleLifecycleRepository,
      { roleId: () => roleId },
    );

    await expect(
      command.execute(currentUser(PermissionId.ROLES_CREATE), {
        name: '  Приймальник e\u0301  ',
        permissionIds: [PermissionId.ROLES_WATCH],
      }),
    ).resolves.toEqual({ id: roleId, name: 'Приймальник e\u0301' });
    expect(repository.createCustomRole).toHaveBeenCalledWith(
      {
        id: roleId,
        warehouseId,
        name: 'Приймальник e\u0301',
      },
      [{ id: PermissionId.ROLES_WATCH }],
    );
    expect(repository.lockWarehouse).toHaveBeenCalledWith(warehouseId);
    expect(repository.findAssignablePermissions).toHaveBeenCalledWith([
      PermissionId.ROLES_WATCH,
    ]);
    expect(repository.findRoleByName).toHaveBeenCalledWith(
      warehouseId,
      'Приймальник e\u0301',
    );
    expect(
      Reflect.getMetadata(
        TRANSACTIONAL_KEY,
        CreateRoleCommand.prototype.execute,
      ) as TransactionalMetadata | undefined,
    ).toEqual({ propagation: undefined, isolationLevel: undefined });
  });

  it('renames a custom Role and replaces its Permission membership with an empty set', async () => {
    const repository = repositoryDouble();
    const command = new UpdateRoleCommand(
      repository as unknown as RoleLifecycleRepository,
    );

    await expect(
      command.execute(currentUser(PermissionId.ROLES_UPDATE), {
        roleId,
        name: '  Picker  ',
        permissionIds: [],
      }),
    ).resolves.toEqual({ id: roleId, name: 'Picker' });
    expect(repository.lockWarehouse).toHaveBeenCalledWith(warehouseId);
    expect(repository.lockCustomRole).toHaveBeenCalledWith(warehouseId, roleId);
    expect(repository.findAssignablePermissions).toHaveBeenCalledWith([]);
    expect(repository.findRoleByName).toHaveBeenCalledWith(
      warehouseId,
      'Picker',
    );
    expect(repository.updateCustomRole).toHaveBeenCalledWith(roleId, 'Picker');
    expect(repository.replaceCustomRolePermissions).toHaveBeenCalledWith(
      roleId,
      [],
    );
    expect(
      Reflect.getMetadata(
        TRANSACTIONAL_KEY,
        UpdateRoleCommand.prototype.execute,
      ) as TransactionalMetadata | undefined,
    ).toEqual({ propagation: undefined, isolationLevel: undefined });
  });

  it.each([
    ['duplicate name', 'name-conflict'],
    ['unknown or reserved Permission', 'invalid-permission'],
  ] as const)('rejects a %s before creating a Role', async (_case, result) => {
    const repository = repositoryDouble();
    if (result === 'name-conflict') {
      repository.findRoleByName.mockResolvedValue({ id: actorId });
    } else {
      repository.findAssignablePermissions.mockResolvedValue([]);
    }
    const command = new CreateRoleCommand(
      repository as unknown as RoleLifecycleRepository,
      { roleId: () => roleId },
    );

    await expect(
      command.execute(currentUser(PermissionId.ROLES_CREATE), {
        name: 'Picker',
        permissionIds: [PermissionId.ROLES_WATCH],
      }),
    ).rejects.toMatchObject({
      code:
        result === 'name-conflict'
          ? ErrorCode.ACCESS_ROLE_NAME_CONFLICT
          : ErrorCode.ACCESS_INVALID_ROLE,
    });
    expect(repository.createCustomRole).not.toHaveBeenCalled();
  });

  it.each([
    ['protected or foreign Role', 'role-unavailable'],
    ['duplicate name', 'name-conflict'],
    ['unknown or reserved Permission', 'invalid-permission'],
  ] as const)(
    'rejects a %s without confirming an update',
    async (_case, result) => {
      const repository = repositoryDouble();
      if (result === 'role-unavailable') {
        repository.lockCustomRole.mockResolvedValue(null);
      } else if (result === 'name-conflict') {
        repository.findRoleByName.mockResolvedValue({ id: actorId });
      } else {
        repository.findAssignablePermissions.mockResolvedValue([]);
      }
      const command = new UpdateRoleCommand(
        repository as unknown as RoleLifecycleRepository,
      );

      await expect(
        command.execute(currentUser(PermissionId.ROLES_UPDATE), {
          roleId,
          name: 'Picker',
          permissionIds: [PermissionId.ROLES_WATCH],
        }),
      ).rejects.toMatchObject({
        code:
          result === 'name-conflict'
            ? ErrorCode.ACCESS_ROLE_NAME_CONFLICT
            : result === 'invalid-permission'
              ? ErrorCode.ACCESS_INVALID_ROLE
              : ErrorCode.ACCESS_ROLE_UNAVAILABLE,
      });
      expect(repository.createCustomRole).not.toHaveBeenCalled();
    },
  );

  it('relies on the transport guard for Role write authorization', async () => {
    const repository = repositoryDouble();
    const create = new CreateRoleCommand(
      repository as unknown as RoleLifecycleRepository,
      { roleId: () => roleId },
    );
    const update = new UpdateRoleCommand(
      repository as unknown as RoleLifecycleRepository,
    );

    await expect(
      create.execute(currentUser(PermissionId.ROLES_WATCH), {
        name: 'Picker',
        permissionIds: [],
      }),
    ).resolves.toEqual({ id: roleId, name: 'Picker' });
    await expect(
      update.execute(currentUser(PermissionId.ROLES_WATCH), {
        roleId,
        name: 'Picker',
        permissionIds: [],
      }),
    ).resolves.toEqual({ id: roleId, name: 'Picker' });
    expect(repository.createCustomRole).toHaveBeenCalled();
    expect(repository.updateCustomRole).toHaveBeenCalled();
  });

  it.each(['', 'x\u200by', `${'a'.repeat(100)}💼`])(
    'rejects invalid Role name %p before persistence',
    async (name) => {
      const repository = repositoryDouble();
      const command = new CreateRoleCommand(
        repository as unknown as RoleLifecycleRepository,
        { roleId: () => roleId },
      );

      await expect(
        command.execute(currentUser(PermissionId.ROLES_CREATE), {
          name,
          permissionIds: [],
        }),
      ).rejects.toThrow();
      expect(repository.createCustomRole).not.toHaveBeenCalled();
    },
  );
});
