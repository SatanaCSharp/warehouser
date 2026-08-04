import { PermissionId } from '@warehouser/shared-types/enums';
import { CreateRoleCommand } from 'access/usecases/commands/create-role.command';
import { UpdateRoleCommand } from 'access/usecases/commands/update-role.command';
import type { AccessPrincipal } from 'shared/access/access-principal';
import { RoleLifecycleRepository } from 'shared/domain/repositories/access/role-lifecycle.repository';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const roleId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000003';

const principal = (
  permissionId: AccessPrincipal['permissionId'],
): AccessPrincipal => ({
  userId: actorId,
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000004',
  roleKind: 'custom',
  permissionId,
});

const repositoryDouble = () => ({
  createCustomRole: jest.fn().mockResolvedValue('saved'),
  updateCustomRole: jest.fn().mockResolvedValue('saved'),
});

describe('custom Role lifecycle commands', () => {
  it('creates a Warehouse-scoped Role with trimmed Unicode and assignable Permissions', async () => {
    const repository = repositoryDouble();
    const command = new CreateRoleCommand(
      repository as unknown as RoleLifecycleRepository,
      { roleId: () => roleId },
    );

    await expect(
      command.execute(principal(PermissionId.ROLES_CREATE), {
        name: '  Приймальник e\u0301  ',
        permissionIds: [PermissionId.ROLES_WATCH],
      }),
    ).resolves.toEqual({ id: roleId, name: 'Приймальник e\u0301' });
    expect(repository.createCustomRole).toHaveBeenCalledWith({
      id: roleId,
      warehouseId,
      name: 'Приймальник e\u0301',
      permissionIds: [PermissionId.ROLES_WATCH],
    });
  });

  it('renames a custom Role and replaces its Permission membership with an empty set', async () => {
    const repository = repositoryDouble();
    const command = new UpdateRoleCommand(
      repository as unknown as RoleLifecycleRepository,
    );

    await expect(
      command.execute(principal(PermissionId.ROLES_UPDATE), {
        roleId,
        name: '  Picker  ',
        permissionIds: [],
      }),
    ).resolves.toEqual({ id: roleId, name: 'Picker' });
    expect(repository.updateCustomRole).toHaveBeenCalledWith({
      id: roleId,
      warehouseId,
      name: 'Picker',
      permissionIds: [],
    });
  });

  it.each([
    ['duplicate name', 'name-conflict'],
    ['unknown or reserved Permission', 'invalid-permission'],
  ] as const)(
    'rejects a %s without confirming a create',
    async (_case, result) => {
      const repository = repositoryDouble();
      repository.createCustomRole.mockResolvedValue(result);
      const command = new CreateRoleCommand(
        repository as unknown as RoleLifecycleRepository,
        { roleId: () => roleId },
      );

      await expect(
        command.execute(principal(PermissionId.ROLES_CREATE), {
          name: 'Picker',
          permissionIds: [PermissionId.ROLES_WATCH],
        }),
      ).rejects.toThrow();
      expect(repository.updateCustomRole).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['protected or foreign Role', 'role-unavailable'],
    ['duplicate name', 'name-conflict'],
    ['unknown or reserved Permission', 'invalid-permission'],
  ] as const)(
    'rejects a %s without confirming an update',
    async (_case, result) => {
      const repository = repositoryDouble();
      repository.updateCustomRole.mockResolvedValue(result);
      const command = new UpdateRoleCommand(
        repository as unknown as RoleLifecycleRepository,
      );

      await expect(
        command.execute(principal(PermissionId.ROLES_UPDATE), {
          roleId,
          name: 'Picker',
          permissionIds: [PermissionId.ROLES_WATCH],
        }),
      ).rejects.toThrow();
      expect(repository.createCustomRole).not.toHaveBeenCalled();
    },
  );

  it('rejects missing command authority before any Role write', async () => {
    const repository = repositoryDouble();
    const create = new CreateRoleCommand(
      repository as unknown as RoleLifecycleRepository,
      { roleId: () => roleId },
    );
    const update = new UpdateRoleCommand(
      repository as unknown as RoleLifecycleRepository,
    );

    await expect(
      create.execute(principal(PermissionId.ROLES_WATCH), {
        name: 'Picker',
        permissionIds: [],
      }),
    ).rejects.toThrow();
    await expect(
      update.execute(principal(PermissionId.ROLES_WATCH), {
        roleId,
        name: 'Picker',
        permissionIds: [],
      }),
    ).rejects.toThrow();
    expect(repository.createCustomRole).not.toHaveBeenCalled();
    expect(repository.updateCustomRole).not.toHaveBeenCalled();
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
        command.execute(principal(PermissionId.ROLES_CREATE), {
          name,
          permissionIds: [],
        }),
      ).rejects.toThrow();
      expect(repository.createCustomRole).not.toHaveBeenCalled();
    },
  );
});
