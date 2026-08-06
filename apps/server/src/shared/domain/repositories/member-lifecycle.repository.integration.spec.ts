import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { MemberLifecycleRepository } from 'shared/domain/repositories/member-lifecycle.repository';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-06T12:00:00.000Z');

const warehouseAId = '00000000-0000-4000-8000-000000000101';
const warehouseBId = '00000000-0000-4000-8000-000000000102';
const roleAId = '00000000-0000-4000-8000-000000000201';
const roleBId = '00000000-0000-4000-8000-000000000202';
const memberUserId = '00000000-0000-4000-8000-000000000301';
const newMemberUserId = '00000000-0000-4000-8000-000000000302';
const permissionOneId = 'USERS:EMAIL_UPDATE';
const permissionTwoId = 'USERS:PASSWORD_CHANGE';

describeIntegration('MemberLifecycleRepository', () => {
  const repository = new MemberLifecycleRepository(dataSource);
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, roles, warehouses, sessions, users, accounts, permissions CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  const seedWarehouses = async (): Promise<void> => {
    const manager = dataSource.manager;
    await manager.getRepository(WarehouseEntity).insert([
      { id: warehouseAId, name: 'Warehouse A', createdAt: now, updatedAt: now },
      { id: warehouseBId, name: 'Warehouse B', createdAt: now, updatedAt: now },
    ]);
    await manager.getRepository(RoleEntity).insert([
      {
        id: roleAId,
        warehouseId: warehouseAId,
        name: 'Custom Role A',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: roleBId,
        warehouseId: warehouseBId,
        name: 'Custom Role B',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      },
    ]);
  };

  // `accounts.user_id` / `users.account_id` form a deferred circular FK pair
  // (`fk_accounts_user_id` / `fk_users_account_id`, both `INITIALLY
  // DEFERRED`): the check only fires at COMMIT, so both inserts must run
  // inside one transaction rather than as separate implicit-transaction
  // `.insert()` calls, or the deferred check fires before the paired row
  // exists.
  const seedIdentity = async (
    userId: string,
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
        createdAt: now,
        updatedAt: now,
      });
    });
  };

  const seedMembership = async (
    warehouseId: string,
    roleId: string,
  ): Promise<void> => {
    // `warehouse_memberships.user_id` has a non-deferrable FK to `users(id)`
    // (`fk_warehouse_memberships_user_id`), so the member's identity must
    // already exist before the membership row is inserted.
    await seedIdentity(memberUserId, 'member@example.test');
    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
      userId: memberUserId,
      warehouseId,
      roleId,
      roleKind: 'custom',
      createdAt: now,
      updatedAt: now,
    });
  };

  describe('lockMembership', () => {
    it('locks a membership scoped to the given Warehouse', async () => {
      await seedWarehouses();
      await seedMembership(warehouseAId, roleAId);

      const locked = await transactions.executeInTransaction({}, () =>
        repository.lockMembership(warehouseAId, memberUserId),
      );

      expect(locked).toMatchObject({
        userId: memberUserId,
        warehouseId: warehouseAId,
        roleId: roleAId,
      });
    });

    it('does not match a membership scoped to a different Warehouse (cross-Warehouse hiding)', async () => {
      await seedWarehouses();
      // membership actually lives in warehouse B
      await seedMembership(warehouseBId, roleBId);

      const locked = await transactions.executeInTransaction({}, () =>
        repository.lockMembership(warehouseAId, memberUserId),
      );

      expect(locked).toBeNull();
    });
  });

  describe('findRoleGrantedPermissionIds', () => {
    it('returns the Permission IDs granted to a Role', async () => {
      await seedWarehouses();
      await dataSource.manager.getRepository(PermissionEntity).insert([
        {
          id: permissionOneId,
          label: 'Update user email',
          kind: 'assignable',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: permissionTwoId,
          label: 'Change user password',
          kind: 'assignable',
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await dataSource.manager.getRepository(RolePermissionEntity).insert([
        {
          roleId: roleAId,
          permissionId: permissionOneId,
          roleKind: 'custom',
          permissionKind: 'assignable',
        },
        {
          roleId: roleAId,
          permissionId: permissionTwoId,
          roleKind: 'custom',
          permissionKind: 'assignable',
        },
      ]);

      const permissionIds =
        await repository.findRoleGrantedPermissionIds(roleAId);

      expect(permissionIds.sort()).toEqual(
        [permissionOneId, permissionTwoId].sort(),
      );
    });

    it('returns an empty array for a Role with no granted Permissions', async () => {
      await seedWarehouses();

      const permissionIds =
        await repository.findRoleGrantedPermissionIds(roleAId);

      expect(permissionIds).toEqual([]);
    });
  });

  describe('insertMembership', () => {
    it('inserts a new custom-kind Warehouse Membership row', async () => {
      await seedWarehouses();
      // insertMembership only writes the membership row; the identity it
      // references must already exist to satisfy the FK, so seed a minimal
      // account/user pair first.
      await seedIdentity(newMemberUserId, 'new-member@example.test');

      await repository.insertMembership({
        userId: newMemberUserId,
        warehouseId: warehouseAId,
        roleId: roleAId,
        roleKind: 'custom',
      });

      const membership = await dataSource.manager
        .getRepository(WarehouseMembershipEntity)
        .findOneBy({ userId: newMemberUserId });
      expect(membership).toMatchObject({
        userId: newMemberUserId,
        warehouseId: warehouseAId,
        roleId: roleAId,
        roleKind: 'custom',
      });
    });
  });

  describe('deleteMembership', () => {
    it('deletes the Warehouse Membership row scoped by Warehouse and user', async () => {
      await seedWarehouses();
      await seedMembership(warehouseAId, roleAId);

      await repository.deleteMembership(warehouseAId, memberUserId);

      const membership = await dataSource.manager
        .getRepository(WarehouseMembershipEntity)
        .findOneBy({ userId: memberUserId });
      expect(membership).toBeNull();
    });

    it('does not delete a membership scoped to a different Warehouse', async () => {
      await seedWarehouses();
      await seedMembership(warehouseBId, roleBId);

      await repository.deleteMembership(warehouseAId, memberUserId);

      const membership = await dataSource.manager
        .getRepository(WarehouseMembershipEntity)
        .findOneBy({ userId: memberUserId });
      expect(membership).not.toBeNull();
    });
  });
});
