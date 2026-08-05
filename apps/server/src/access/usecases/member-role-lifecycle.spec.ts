import { ErrorCode, PermissionId } from '@warehouser/shared-types/enums';
import { RoleDeletionService } from 'access/domain/services/role-deletion.service';
import { AssignMemberRoleCommand } from 'access/usecases/commands/assign-member-role.command';
import { DeleteRoleCommand } from 'access/usecases/commands/delete-role.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import {
  TRANSACTIONAL_KEY,
  type TransactionalMetadata,
} from 'shared/decorators/transactional.decorator';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const sourceRoleId = '00000000-0000-4000-8000-000000000002';
const replacementRoleId = '00000000-0000-4000-8000-000000000003';
const memberId = '00000000-0000-4000-8000-000000000004';

const currentUser = (
  permissionId: AccessCurrentUser['permissionId'],
): AccessCurrentUser => ({
  userId: '00000000-0000-4000-8000-000000000005',
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000006',
  roleKind: 'custom',
  permissionId,
});

const repositoryDouble = () => ({
  findMemberRole: jest.fn().mockResolvedValue({ roleKind: 'custom' }),
  findCustomRole: jest.fn().mockResolvedValue({
    id: replacementRoleId,
    kind: 'custom',
  }),
  updateMemberRole: jest.fn().mockResolvedValue(true),
  lockWarehouse: jest.fn().mockResolvedValue({ id: warehouseId }),
  lockCustomRole: jest
    .fn()
    .mockImplementation((_warehouseId: string, id: string) =>
      Promise.resolve({ id }),
    ),
  countRoleMembers: jest.fn().mockResolvedValue(0),
  replaceRoleAssignments: jest.fn().mockResolvedValue(undefined),
  removeCustomRole: jest.fn().mockResolvedValue(undefined),
});

const deleteRoleCommand = (repository: ReturnType<typeof repositoryDouble>) => {
  const roles = repository as unknown as RoleLifecycleRepository;
  return new DeleteRoleCommand(roles, new RoleDeletionService(roles));
};

describe('member Role lifecycle commands', () => {
  it('assigns exactly one same-Warehouse custom Role', async () => {
    const repository = repositoryDouble();
    const command = new AssignMemberRoleCommand(
      repository as unknown as RoleLifecycleRepository,
    );

    await expect(
      command.execute(currentUser(PermissionId.ROLES_ASSIGN), {
        memberId,
        roleId: replacementRoleId,
      }),
    ).resolves.toEqual({ memberId, roleId: replacementRoleId });
    expect(repository.findMemberRole).toHaveBeenCalledWith(
      warehouseId,
      memberId,
    );
    expect(repository.findCustomRole).toHaveBeenCalledWith(
      warehouseId,
      replacementRoleId,
    );
    expect(repository.updateMemberRole).toHaveBeenCalledWith(
      warehouseId,
      memberId,
      replacementRoleId,
    );
  });

  it('denies an unavailable member', async () => {
    const repository = repositoryDouble();
    repository.findMemberRole.mockResolvedValue(null);
    const command = new AssignMemberRoleCommand(
      repository as unknown as RoleLifecycleRepository,
    );

    await expect(
      command.execute(currentUser(PermissionId.ROLES_ASSIGN), {
        memberId,
        roleId: replacementRoleId,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ACCESS_TARGET_UNAVAILABLE });
  });

  it('requires a transfer when assigning a Role to the Warehouse manager', async () => {
    const repository = repositoryDouble();
    repository.findMemberRole.mockResolvedValue({
      roleKind: 'warehouse_manager',
    });
    const command = new AssignMemberRoleCommand(
      repository as unknown as RoleLifecycleRepository,
    );

    await expect(
      command.execute(currentUser(PermissionId.ROLES_ASSIGN), {
        memberId,
        roleId: replacementRoleId,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.ACCESS_MANAGER_TRANSFER_REQUIRED,
    });
    expect(repository.findCustomRole).not.toHaveBeenCalled();
  });

  it('denies an unavailable custom Role', async () => {
    const repository = repositoryDouble();
    repository.findCustomRole.mockResolvedValue(null);
    const command = new AssignMemberRoleCommand(
      repository as unknown as RoleLifecycleRepository,
    );

    await expect(
      command.execute(currentUser(PermissionId.ROLES_ASSIGN), {
        memberId,
        roleId: replacementRoleId,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ACCESS_TARGET_UNAVAILABLE });
    expect(repository.updateMemberRole).not.toHaveBeenCalled();
  });

  it('denies an assignment when the member update misses', async () => {
    const repository = repositoryDouble();
    repository.updateMemberRole.mockResolvedValue(false);
    const command = new AssignMemberRoleCommand(
      repository as unknown as RoleLifecycleRepository,
    );

    await expect(
      command.execute(currentUser(PermissionId.ROLES_ASSIGN), {
        memberId,
        roleId: replacementRoleId,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ACCESS_TARGET_UNAVAILABLE });
  });

  it('atomically replaces assigned members and deletes the source Role', async () => {
    const repository = repositoryDouble();
    const command = deleteRoleCommand(repository);

    await expect(
      command.execute(currentUser(PermissionId.ROLES_DELETE), {
        roleId: sourceRoleId,
        replacementRoleId,
      }),
    ).resolves.toEqual({ id: sourceRoleId });
    expect(repository.replaceRoleAssignments).toHaveBeenCalledWith(
      warehouseId,
      sourceRoleId,
      replacementRoleId,
    );
    expect(repository.removeCustomRole).toHaveBeenCalledWith(
      warehouseId,
      sourceRoleId,
    );
    expect(
      Reflect.getMetadata(
        TRANSACTIONAL_KEY,
        DeleteRoleCommand.prototype.execute,
      ) as TransactionalMetadata | undefined,
    ).toEqual({ propagation: undefined, isolationLevel: undefined });
  });

  it('deletes an unassigned custom Role without a replacement', async () => {
    const repository = repositoryDouble();
    const command = deleteRoleCommand(repository);

    await expect(
      command.execute(currentUser(PermissionId.ROLES_DELETE), {
        roleId: sourceRoleId,
      }),
    ).resolves.toEqual({ id: sourceRoleId });
    expect(repository.removeCustomRole).toHaveBeenCalledWith(
      warehouseId,
      sourceRoleId,
    );
  });

  it('relies on the transport guard for assignment and deletion authorization', async () => {
    const repository = repositoryDouble();
    const assign = new AssignMemberRoleCommand(
      repository as unknown as RoleLifecycleRepository,
    );
    const remove = deleteRoleCommand(repository);

    await expect(
      assign.execute(currentUser(PermissionId.ROLES_WATCH), {
        memberId,
        roleId: replacementRoleId,
      }),
    ).resolves.toEqual({ memberId, roleId: replacementRoleId });
    await expect(
      remove.execute(currentUser(PermissionId.ROLES_WATCH), {
        roleId: sourceRoleId,
      }),
    ).resolves.toEqual({ id: sourceRoleId });
    expect(repository.findMemberRole).toHaveBeenCalled();
    expect(repository.lockWarehouse).toHaveBeenCalled();
  });

  it('rolls back when the source Role is unavailable', async () => {
    const repository = repositoryDouble();
    repository.lockCustomRole.mockResolvedValue(null);
    const command = deleteRoleCommand(repository);

    await expect(
      command.execute(currentUser(PermissionId.ROLES_DELETE), {
        roleId: sourceRoleId,
        replacementRoleId,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ACCESS_ROLE_UNAVAILABLE });
  });

  it('rolls back when the replacement Role is unavailable', async () => {
    const repository = repositoryDouble();
    repository.lockCustomRole
      .mockResolvedValueOnce({ id: sourceRoleId })
      .mockResolvedValueOnce(null);
    const command = deleteRoleCommand(repository);

    await expect(
      command.execute(currentUser(PermissionId.ROLES_DELETE), {
        roleId: sourceRoleId,
        replacementRoleId,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ACCESS_REPLACEMENT_REQUIRED });
  });
});
