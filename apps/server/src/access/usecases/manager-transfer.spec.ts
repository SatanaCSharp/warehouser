import { ErrorCode, PermissionId } from '@warehouser/shared-types/enums';
import { TransferWarehouseManagerCommand } from 'access/usecases/commands/transfer-warehouse-manager.command';
import type { AccessPrincipal } from 'shared/access/access-principal';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { ManagerTransferRepository } from 'shared/domain/repositories/access/manager-transfer.repository';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const managerId = '00000000-0000-4000-8000-000000000002';
const recipientId = '00000000-0000-4000-8000-000000000003';
const replacementRoleId = '00000000-0000-4000-8000-000000000004';

const principal = (
  overrides: Partial<AccessPrincipal> = {},
): AccessPrincipal => ({
  userId: managerId,
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000005',
  roleKind: 'warehouse_manager',
  permissionId: PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
  ...overrides,
});

const repositoryDouble = () => ({
  transfer: jest.fn().mockResolvedValue('transferred'),
});
const transactionsDouble = () => ({
  executeInTransaction: jest.fn(
    async (_options: unknown, callback: () => Promise<unknown>) => callback(),
  ),
});

describe('TransferWarehouseManagerCommand', () => {
  it('commits recipient promotion and former-manager reassignment together', async () => {
    const repository = repositoryDouble();
    const transactions = transactionsDouble();
    const command = new TransferWarehouseManagerCommand(
      repository as unknown as ManagerTransferRepository,
      transactions as unknown as DbTransactionService,
    );

    await expect(
      command.execute(principal(), { recipientId, replacementRoleId }),
    ).resolves.toEqual({ managerId: recipientId });
    expect(repository.transfer).toHaveBeenCalledWith({
      warehouseId,
      currentManagerUserId: managerId,
      recipientUserId: recipientId,
      formerManagerRoleId: replacementRoleId,
    });
    expect(transactions.executeInTransaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    { roleKind: 'custom' as const },
    { permissionId: PermissionId.ROLES_ASSIGN },
  ])(
    'rejects a non-manager or missing reserved Permission',
    async (overrides) => {
      const repository = repositoryDouble();
      const command = new TransferWarehouseManagerCommand(
        repository as unknown as ManagerTransferRepository,
        transactionsDouble() as unknown as DbTransactionService,
      );

      await expect(
        command.execute(principal(overrides), {
          recipientId,
          replacementRoleId,
        }),
      ).rejects.toThrow();
      expect(repository.transfer).not.toHaveBeenCalled();
    },
  );

  it('rejects self transfer before persistence', async () => {
    const repository = repositoryDouble();
    const command = new TransferWarehouseManagerCommand(
      repository as unknown as ManagerTransferRepository,
      transactionsDouble() as unknown as DbTransactionService,
    );
    await expect(
      command.execute(principal(), {
        recipientId: managerId,
        replacementRoleId,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.ACCESS_INVALID_MANAGER_TRANSFER,
    });
    expect(repository.transfer).not.toHaveBeenCalled();
  });

  it('rejects scoped recipient or replacement misses atomically', async () => {
    const repository = repositoryDouble();
    repository.transfer.mockResolvedValue('target-unavailable');
    const command = new TransferWarehouseManagerCommand(
      repository as unknown as ManagerTransferRepository,
      transactionsDouble() as unknown as DbTransactionService,
    );
    await expect(
      command.execute(principal(), { recipientId, replacementRoleId }),
    ).rejects.toMatchObject({ code: ErrorCode.ACCESS_TARGET_UNAVAILABLE });
  });
});
