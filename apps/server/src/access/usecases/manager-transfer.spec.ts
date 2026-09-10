import { ErrorCode, PermissionId } from '@warehouser/shared-types/enums';
import { TransferWarehouseManagerCommand } from 'access/usecases/commands/transfer-warehouse-manager.command.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import { ManagerTransferRepository } from 'shared/domain/repositories/manager-transfer.repository.js';
import { describe, expect, it, vi } from 'vitest';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const managerId = '00000000-0000-4000-8000-000000000002';
const recipientId = '00000000-0000-4000-8000-000000000003';
const replacementRoleId = '00000000-0000-4000-8000-000000000004';
const managerRoleId = '00000000-0000-4000-8000-000000000005';

const currentUser = (
  overrides: Partial<AccessCurrentUser> = {},
): AccessCurrentUser => ({
  userId: managerId,
  warehouseId,
  roleId: managerRoleId,
  roleKind: 'warehouse_manager',
  permissionId: PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
  observedPermissionIds: [],
  archived: false,
  ...overrides,
});

const repositoryDouble = () => ({
  lockWarehouse: vi.fn().mockResolvedValue({ id: warehouseId }),
  lockReplacementRole: vi.fn().mockResolvedValue({
    id: replacementRoleId,
  }),
  lockMembers: vi.fn().mockResolvedValue([
    { userId: managerId, roleId: managerRoleId, roleKind: 'warehouse_manager' },
    { userId: recipientId, roleId: replacementRoleId, roleKind: 'custom' },
  ]),
  assignRole: vi.fn().mockResolvedValue(true),
});
describe('TransferWarehouseManagerCommand', () => {
  it('commits recipient promotion and former-manager reassignment together', async () => {
    const repository = repositoryDouble();
    const command = new TransferWarehouseManagerCommand(
      repository as unknown as ManagerTransferRepository,
    );

    await expect(
      command.execute(currentUser(), { recipientId, replacementRoleId }),
    ).resolves.toEqual({ managerId: recipientId });
    expect(repository.assignRole).toHaveBeenNthCalledWith(
      1,
      warehouseId,
      managerId,
      replacementRoleId,
      'custom',
    );
    expect(repository.assignRole).toHaveBeenNthCalledWith(
      2,
      warehouseId,
      recipientId,
      managerRoleId,
      'warehouse_manager',
    );
  });

  it('rejects a non-manager as a business invariant', async () => {
    const repository = repositoryDouble();
    const command = new TransferWarehouseManagerCommand(
      repository as unknown as ManagerTransferRepository,
    );

    await expect(
      command.execute(currentUser({ roleKind: 'custom' }), {
        recipientId,
        replacementRoleId,
      }),
    ).rejects.toThrow();
    expect(repository.lockWarehouse).not.toHaveBeenCalled();
  });

  it('relies on the transport guard for manager-transfer authorization', async () => {
    const repository = repositoryDouble();
    const command = new TransferWarehouseManagerCommand(
      repository as unknown as ManagerTransferRepository,
    );

    await expect(
      command.execute(
        currentUser({ permissionId: PermissionId.ROLES_ASSIGN }),
        {
          recipientId,
          replacementRoleId,
        },
      ),
    ).resolves.toEqual({ managerId: recipientId });
    expect(repository.lockWarehouse).toHaveBeenCalled();
  });

  it('rejects self transfer before persistence', async () => {
    const repository = repositoryDouble();
    const command = new TransferWarehouseManagerCommand(
      repository as unknown as ManagerTransferRepository,
    );
    await expect(
      command.execute(currentUser(), {
        recipientId: managerId,
        replacementRoleId,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.ACCESS_INVALID_MANAGER_TRANSFER,
    });
    expect(repository.lockWarehouse).not.toHaveBeenCalled();
  });

  it('rejects a recipient holding no membership in that Warehouse as an invalid transfer (AC-36a)', async () => {
    const repository = repositoryDouble();
    // Only the outgoing Manager's membership is locked in this Warehouse: the recipient is a
    // member of another Warehouse, or of none.
    repository.lockMembers.mockResolvedValue([
      {
        userId: managerId,
        roleId: managerRoleId,
        roleKind: 'warehouse_manager',
      },
    ]);
    const command = new TransferWarehouseManagerCommand(
      repository as unknown as ManagerTransferRepository,
    );

    await expect(
      command.execute(currentUser(), { recipientId, replacementRoleId }),
    ).rejects.toMatchObject({
      code: ErrorCode.ACCESS_INVALID_MANAGER_TRANSFER,
    });
    // Exactly one Manager is preserved because no reassignment was attempted.
    expect(repository.assignRole).not.toHaveBeenCalled();
  });

  it('rejects a replacement Role that is not a custom Role of that Warehouse (AC-36a)', async () => {
    const repository = repositoryDouble();
    repository.lockReplacementRole.mockResolvedValue(null);
    const command = new TransferWarehouseManagerCommand(
      repository as unknown as ManagerTransferRepository,
    );

    await expect(
      command.execute(currentUser(), { recipientId, replacementRoleId }),
    ).rejects.toMatchObject({
      code: ErrorCode.ACCESS_INVALID_MANAGER_TRANSFER,
    });
    expect(repository.assignRole).not.toHaveBeenCalled();
  });

  it('scopes both reassignments to the named Warehouse, leaving other-Warehouse memberships untouched (AC-36)', async () => {
    const repository = repositoryDouble();
    const command = new TransferWarehouseManagerCommand(
      repository as unknown as ManagerTransferRepository,
    );

    await command.execute(currentUser(), { recipientId, replacementRoleId });

    expect(repository.lockMembers).toHaveBeenCalledWith(warehouseId, [
      managerId,
      recipientId,
    ]);
    for (const call of repository.assignRole.mock.calls) {
      expect(call[0]).toBe(warehouseId);
    }
  });

  it('rejects scoped recipient or replacement misses atomically', async () => {
    const repository = repositoryDouble();
    repository.lockWarehouse.mockResolvedValue(null);
    const command = new TransferWarehouseManagerCommand(
      repository as unknown as ManagerTransferRepository,
    );
    await expect(
      command.execute(currentUser(), { recipientId, replacementRoleId }),
    ).rejects.toMatchObject({ code: ErrorCode.ACCESS_TARGET_UNAVAILABLE });
  });
});
