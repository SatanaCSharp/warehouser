import { ProvisionInitialAccessCommand } from 'access/usecases/commands/provision-initial-access.command';
import { AccessProvisioningRepository } from 'shared/domain/repositories/access/access-provisioning.repository';

const userId = '00000000-0000-4000-8000-000000000001';
const warehouseId = '00000000-0000-4000-8000-000000000002';
const roleId = '00000000-0000-4000-8000-000000000003';

describe('ProvisionInitialAccessCommand', () => {
  it('constructs the protected manager access graph with the complete catalogue', async () => {
    const repository = {
      provisionInitialAccess: jest.fn().mockResolvedValue(undefined),
    };
    const command = new ProvisionInitialAccessCommand(
      repository as unknown as AccessProvisioningRepository,
      { warehouseId: () => warehouseId, roleId: () => roleId },
    );

    await expect(
      command.execute({ userId, warehouseName: '  Склад e\u0301  ' }),
    ).resolves.toEqual({
      warehouseId,
      roleId,
      roleKind: 'warehouse_manager',
      permissionIds: [
        'ROLES:ASSIGN',
        'ROLES:CREATE',
        'ROLES:DELETE',
        'ROLES:UPDATE',
        'ROLES:WATCH',
        'USERS:CREATE',
        'USERS:UPDATE',
        'USERS:WATCH',
        'WAREHOUSE_MANAGER_ROLE:REASSIGN',
      ],
    });
    expect(repository.provisionInitialAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouse: { id: warehouseId, name: 'Склад e\u0301' },
        managerRole: expect.objectContaining({
          id: roleId,
          warehouseId,
          kind: 'warehouse_manager',
        }),
        managerMembership: {
          userId,
          warehouseId,
          roleId,
          roleKind: 'warehouse_manager',
        },
      }),
    );
  });
});
