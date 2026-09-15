import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository';
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

  // `createCustomRole` and `replaceCustomRolePermissions` both end in the same shape — build the
  // grant rows, and insert them only when there are any. The empty case is not hypothetical: a
  // custom Role with no Permissions is a legal Role, and `insert([])` is what TypeORM refuses, so
  // the guard is load-bearing rather than defensive. Both branches of both methods are covered
  // here because a Role that silently lost its grants and a Role that never had any are
  // indistinguishable once written.
  describe('custom Role writes', () => {
    const seedWarehouse = async (): Promise<string> => {
      const manager = dataSource.manager;
      const workspace = buildWorkspace();
      await manager.getRepository(WorkspaceEntity).insert(workspace);
      const warehouse = buildWarehouse({ workspaceId: workspace.id as string });
      await manager.getRepository(WarehouseEntity).insert(warehouse);

      return warehouse.id as string;
    };

    // The catalogue the migrations seed — read rather than inserted, so the grants written here are
    // Permissions that actually exist and the foreign key is exercised.
    const assignablePermissions = async (
      take: number,
    ): Promise<PermissionEntity[]> =>
      dataSource.getRepository(PermissionEntity).find({
        where: { kind: 'assignable' },
        order: { id: 'ASC' },
        take,
      });

    const grantedPermissionIds = (roleId: string): Promise<string[]> =>
      dataSource
        .getRepository(RolePermissionEntity)
        .find({ where: { roleId }, order: { permissionId: 'ASC' } })
        .then((rows) => rows.map((row) => row.permissionId));

    it('creates a custom Role with its Permission grants', async () => {
      const warehouseId = await seedWarehouse();
      const permissions = await assignablePermissions(2);
      const roleId = crypto.randomUUID();

      await repository.createCustomRole(
        { id: roleId, warehouseId, name: 'Receiving clerk' },
        permissions,
      );

      await expect(
        dataSource.getRepository(RoleEntity).findOneBy({ id: roleId }),
      ).resolves.toMatchObject({
        warehouseId,
        name: 'Receiving clerk',
        kind: 'custom',
      });
      await expect(grantedPermissionIds(roleId)).resolves.toEqual(
        permissions.map((permission) => permission.id),
      );
    });

    it('creates a custom Role carrying no Permissions at all', async () => {
      const warehouseId = await seedWarehouse();
      const roleId = crypto.randomUUID();

      await repository.createCustomRole(
        { id: roleId, warehouseId, name: 'Observer' },
        [],
      );

      await expect(
        dataSource.getRepository(RoleEntity).findOneBy({ id: roleId }),
      ).resolves.toMatchObject({ name: 'Observer', kind: 'custom' });
      await expect(grantedPermissionIds(roleId)).resolves.toEqual([]);
    });

    it("replaces a custom Role's grants wholesale rather than merging them", async () => {
      const warehouseId = await seedWarehouse();
      const permissions = await assignablePermissions(3);
      const roleId = crypto.randomUUID();
      await repository.createCustomRole(
        { id: roleId, warehouseId, name: 'Receiving clerk' },
        permissions.slice(0, 2),
      );

      await repository.replaceCustomRolePermissions(roleId, [permissions[2]]);

      // The first two are gone, not kept alongside the third.
      await expect(grantedPermissionIds(roleId)).resolves.toEqual([
        permissions[2].id,
      ]);
    });

    it('strips every grant when the replacement set is empty', async () => {
      const warehouseId = await seedWarehouse();
      const permissions = await assignablePermissions(2);
      const roleId = crypto.randomUUID();
      await repository.createCustomRole(
        { id: roleId, warehouseId, name: 'Receiving clerk' },
        permissions,
      );

      await repository.replaceCustomRolePermissions(roleId, []);

      await expect(grantedPermissionIds(roleId)).resolves.toEqual([]);
    });
  });
});
