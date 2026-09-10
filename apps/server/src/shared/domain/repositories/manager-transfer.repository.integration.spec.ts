import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { ManagerTransferRepository } from 'shared/domain/repositories/manager-transfer.repository';
import {
  buildWarehouse,
  buildWarehouseMembership,
  buildWorkspace,
} from 'test/factories/entity-factories';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const now = new Date('2026-08-12T12:00:00.000Z');

const seedIdentity = async (
  userId: string,
  workspaceId: string,
  normalizedEmail: string,
): Promise<void> => {
  await dataSource.transaction(async (manager) => {
    await manager.getRepository(AccountEntity).insert({
      id: userId,
      userId,
      normalizedEmail,
      passwordHash: 'synthetic-hash',
      passwordHashAlgorithm: 'scrypt',
      passwordHashParameters: { cost: 1_024 },
      createdAt: now,
      updatedAt: now,
    });
    await manager.getRepository(UserEntity).insert({
      id: userId,
      accountId: userId,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    });
  });
};

describe('ManagerTransferRepository', () => {
  const repository = new ManagerTransferRepository(dataSource);

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('assignRole', () => {
    it("matches and updates a membership by the composite (Warehouse, user) key and leaves the same member's membership in another Warehouse untouched (AC-36)", async () => {
      const manager = dataSource.manager;
      const workspace = buildWorkspace();
      await manager.getRepository(WorkspaceEntity).insert(workspace);
      const workspaceId = workspace.id as string;

      const warehouseA = buildWarehouse({ workspaceId });
      const warehouseB = buildWarehouse({ workspaceId });
      await manager
        .getRepository(WarehouseEntity)
        .insert([warehouseA, warehouseB]);
      const warehouseAId = warehouseA.id as string;
      const warehouseBId = warehouseB.id as string;

      const managerRoleAId = crypto.randomUUID();
      const customRoleAId = crypto.randomUUID();
      const customRoleBId = crypto.randomUUID();
      await manager.getRepository(RoleEntity).insert([
        {
          id: managerRoleAId,
          warehouseId: warehouseAId,
          name: 'Warehouse Manager',
          kind: 'warehouse_manager',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: customRoleAId,
          warehouseId: warehouseAId,
          name: 'Custom Role A',
          kind: 'custom',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: customRoleBId,
          warehouseId: warehouseBId,
          name: 'Custom Role B',
          kind: 'custom',
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const outgoingManagerUserId = crypto.randomUUID();
      const recipientUserId = crypto.randomUUID();
      await seedIdentity(
        outgoingManagerUserId,
        workspaceId,
        `outgoing.${outgoingManagerUserId}@example.test`,
      );
      await seedIdentity(
        recipientUserId,
        workspaceId,
        `recipient.${recipientUserId}@example.test`,
      );

      // The outgoing Manager holds the Manager Role in Warehouse A *and* an
      // unrelated custom-Role membership in Warehouse B — only representable
      // now that `warehouse_memberships` is keyed by (user_id, warehouse_id)
      // rather than `user_id` alone.
      await manager.getRepository(WarehouseMembershipEntity).insert([
        buildWarehouseMembership({
          userId: outgoingManagerUserId,
          warehouseId: warehouseAId,
          workspaceId,
          roleId: managerRoleAId,
          roleKind: 'warehouse_manager',
        }),
        buildWarehouseMembership({
          userId: outgoingManagerUserId,
          warehouseId: warehouseBId,
          workspaceId,
          roleId: customRoleBId,
        }),
        buildWarehouseMembership({
          userId: recipientUserId,
          warehouseId: warehouseAId,
          workspaceId,
          roleId: customRoleAId,
        }),
      ]);

      // Demote the outgoing Manager before promoting the recipient: both
      // memberships are in Warehouse A, and `uq_warehouse_memberships_one_manager`
      // allows at most one `warehouse_manager` row per Warehouse at any
      // instant, so a transfer must vacate the Role before granting it.
      const outgoingUpdated = await repository.assignRole(
        warehouseAId,
        outgoingManagerUserId,
        customRoleAId,
        'custom',
      );
      const recipientUpdated = await repository.assignRole(
        warehouseAId,
        recipientUserId,
        managerRoleAId,
        'warehouse_manager',
      );

      expect(recipientUpdated).toBe(true);
      expect(outgoingUpdated).toBe(true);

      const recipientMembership = await manager
        .getRepository(WarehouseMembershipEntity)
        .findOneBy({ userId: recipientUserId, warehouseId: warehouseAId });
      expect(recipientMembership).toMatchObject({
        roleId: managerRoleAId,
        roleKind: 'warehouse_manager',
      });

      const outgoingMembershipInA = await manager
        .getRepository(WarehouseMembershipEntity)
        .findOneBy({
          userId: outgoingManagerUserId,
          warehouseId: warehouseAId,
        });
      expect(outgoingMembershipInA).toMatchObject({
        roleId: customRoleAId,
        roleKind: 'custom',
      });

      // Isolation: the outgoing Manager's membership in Warehouse B is
      // unaffected by the transfer in Warehouse A (AC-36).
      const outgoingMembershipInB = await manager
        .getRepository(WarehouseMembershipEntity)
        .findOneBy({
          userId: outgoingManagerUserId,
          warehouseId: warehouseBId,
        });
      expect(outgoingMembershipInB).toMatchObject({
        roleId: customRoleBId,
        roleKind: 'custom',
      });
    });
  });
});
