import dataSource from 'shared/database/data-source.js';
import { AccountEntity } from 'shared/domain/entities/account.entity.js';
import { RoleEntity } from 'shared/domain/entities/role.entity.js';
import { UserEntity } from 'shared/domain/entities/user.entity.js';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity.js';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity.js';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity.js';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository.js';
import {
  buildWarehouse,
  buildWarehouseMembership,
  buildWorkspace,
} from 'test/factories/entity-factories.js';
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

describe('RoleLifecycleRepository', () => {
  const repository = new RoleLifecycleRepository(dataSource);

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

  describe('replaceRoleAssignments', () => {
    it("moves every membership of the deleted Role in its own Warehouse and leaves the same member's membership in another Warehouse of the Workspace untouched", async () => {
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

      const sourceRoleId = crypto.randomUUID();
      const replacementRoleId = crypto.randomUUID();
      const warehouseBRoleId = crypto.randomUUID();
      await manager.getRepository(RoleEntity).insert([
        {
          id: sourceRoleId,
          warehouseId: warehouseAId,
          name: 'Deleted custom Role',
          kind: 'custom',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: replacementRoleId,
          warehouseId: warehouseAId,
          name: 'Replacement custom Role',
          kind: 'custom',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: warehouseBRoleId,
          warehouseId: warehouseBId,
          name: 'Warehouse B custom Role',
          kind: 'custom',
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const memberUserId = crypto.randomUUID();
      await seedIdentity(
        memberUserId,
        workspaceId,
        `member.${memberUserId}@example.test`,
      );

      // Same member holds a membership under the deleted Role in Warehouse A
      // and an unrelated membership in Warehouse B — only representable now
      // that `warehouse_memberships` carries `workspace_id` and is keyed by
      // (user_id, warehouse_id).
      await manager.getRepository(WarehouseMembershipEntity).insert([
        buildWarehouseMembership({
          userId: memberUserId,
          warehouseId: warehouseAId,
          workspaceId,
          roleId: sourceRoleId,
        }),
        buildWarehouseMembership({
          userId: memberUserId,
          warehouseId: warehouseBId,
          workspaceId,
          roleId: warehouseBRoleId,
        }),
      ]);

      await repository.replaceRoleAssignments(
        warehouseAId,
        sourceRoleId,
        replacementRoleId,
      );

      const membershipInA = await manager
        .getRepository(WarehouseMembershipEntity)
        .findOneBy({ userId: memberUserId, warehouseId: warehouseAId });
      expect(membershipInA).toMatchObject({
        roleId: replacementRoleId,
        workspaceId,
      });

      const membershipInB = await manager
        .getRepository(WarehouseMembershipEntity)
        .findOneBy({ userId: memberUserId, warehouseId: warehouseBId });
      expect(membershipInB).toMatchObject({
        roleId: warehouseBRoleId,
        workspaceId,
      });
    });
  });
});
