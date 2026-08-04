import { ErrorCode, PermissionId } from '@warehouser/shared-types/enums';
import { AssignMemberRoleCommand } from 'access/usecases/commands/assign-member-role.command';
import { DeleteRoleCommand } from 'access/usecases/commands/delete-role.command';
import type { AccessPrincipal } from 'shared/access/access-principal';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { RoleLifecycleRepository } from 'shared/domain/repositories/access/role-lifecycle.repository';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const sourceRoleId = '00000000-0000-4000-8000-000000000002';
const replacementRoleId = '00000000-0000-4000-8000-000000000003';
const memberId = '00000000-0000-4000-8000-000000000004';

const principal = (
  permissionId: AccessPrincipal['permissionId'],
): AccessPrincipal => ({
  userId: '00000000-0000-4000-8000-000000000005',
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000006',
  roleKind: 'custom',
  permissionId,
});

const repositoryDouble = () => ({
  assignMemberRole: jest.fn().mockResolvedValue('assigned'),
  deleteCustomRole: jest.fn().mockResolvedValue('deleted'),
});

const transactionsDouble = () => ({
  executeInTransaction: jest.fn(
    async (_options: unknown, callback: () => Promise<unknown>) => callback(),
  ),
});

describe('member Role lifecycle commands', () => {
  it('assigns exactly one same-Warehouse custom Role', async () => {
    const repository = repositoryDouble();
    const command = new AssignMemberRoleCommand(
      repository as unknown as RoleLifecycleRepository,
    );

    await expect(
      command.execute(principal(PermissionId.ROLES_ASSIGN), {
        memberId,
        roleId: replacementRoleId,
      }),
    ).resolves.toEqual({ memberId, roleId: replacementRoleId });
    expect(repository.assignMemberRole).toHaveBeenCalledWith(
      warehouseId,
      memberId,
      replacementRoleId,
    );
  });

  it('denies protected, current-manager, and cross-Warehouse assignment misses', async () => {
    const repository = repositoryDouble();
    repository.assignMemberRole.mockResolvedValue('target-unavailable');
    const command = new AssignMemberRoleCommand(
      repository as unknown as RoleLifecycleRepository,
    );

    await expect(
      command.execute(principal(PermissionId.ROLES_ASSIGN), {
        memberId,
        roleId: replacementRoleId,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ACCESS_TARGET_UNAVAILABLE });
  });

  it('atomically replaces assigned members and deletes the source Role', async () => {
    const repository = repositoryDouble();
    const transactions = transactionsDouble();
    const command = new DeleteRoleCommand(
      repository as unknown as RoleLifecycleRepository,
      transactions as unknown as DbTransactionService,
    );

    await expect(
      command.execute(principal(PermissionId.ROLES_DELETE), {
        roleId: sourceRoleId,
        replacementRoleId,
      }),
    ).resolves.toEqual({ id: sourceRoleId });
    expect(repository.deleteCustomRole).toHaveBeenCalledWith(
      warehouseId,
      sourceRoleId,
      replacementRoleId,
    );
    expect(transactions.executeInTransaction).toHaveBeenCalledTimes(1);
  });

  it('deletes an unassigned custom Role without a replacement', async () => {
    const repository = repositoryDouble();
    const command = new DeleteRoleCommand(
      repository as unknown as RoleLifecycleRepository,
      transactionsDouble() as unknown as DbTransactionService,
    );

    await expect(
      command.execute(principal(PermissionId.ROLES_DELETE), {
        roleId: sourceRoleId,
      }),
    ).resolves.toEqual({ id: sourceRoleId });
    expect(repository.deleteCustomRole).toHaveBeenCalledWith(
      warehouseId,
      sourceRoleId,
      undefined,
    );
  });

  it('denies missing authority before assignment or deletion writes', async () => {
    const repository = repositoryDouble();
    const transactions = transactionsDouble();
    const assign = new AssignMemberRoleCommand(
      repository as unknown as RoleLifecycleRepository,
    );
    const remove = new DeleteRoleCommand(
      repository as unknown as RoleLifecycleRepository,
      transactions as unknown as DbTransactionService,
    );

    await expect(
      assign.execute(principal(PermissionId.ROLES_WATCH), {
        memberId,
        roleId: replacementRoleId,
      }),
    ).rejects.toThrow();
    await expect(
      remove.execute(principal(PermissionId.ROLES_WATCH), {
        roleId: sourceRoleId,
      }),
    ).rejects.toThrow();
    expect(repository.assignMemberRole).not.toHaveBeenCalled();
    expect(transactions.executeInTransaction).not.toHaveBeenCalled();
  });

  it.each([
    'role-unavailable',
    'replacement-required',
    'invalid-replacement',
  ] as const)('rolls back and rejects deletion result %s', async (result) => {
    const repository = repositoryDouble();
    repository.deleteCustomRole.mockResolvedValue(result);
    const command = new DeleteRoleCommand(
      repository as unknown as RoleLifecycleRepository,
      transactionsDouble() as unknown as DbTransactionService,
    );

    await expect(
      command.execute(principal(PermissionId.ROLES_DELETE), {
        roleId: sourceRoleId,
        replacementRoleId,
      }),
    ).rejects.toMatchObject({
      code:
        result === 'replacement-required' || result === 'invalid-replacement'
          ? ErrorCode.ACCESS_REPLACEMENT_REQUIRED
          : ErrorCode.ACCESS_ROLE_UNAVAILABLE,
    });
  });
});
