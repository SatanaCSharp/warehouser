import dataSource from 'shared/database/data-source.js';
import { AccountEntity } from 'shared/domain/entities/account.entity.js';
import { RoleEntity } from 'shared/domain/entities/role.entity.js';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity.js';
import { UserEntity } from 'shared/domain/entities/user.entity.js';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity.js';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity.js';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity.js';
import { AccessReadRepository } from 'shared/domain/repositories/access-read.repository.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const now = new Date('2026-08-06T12:00:00.000Z');

const workspaceId = '00000000-0000-4000-8000-000000000400';
const warehouseId = '00000000-0000-4000-8000-000000000401';
const roleId = '00000000-0000-4000-8000-000000000402';
const memberUserId = '00000000-0000-4000-8000-000000000403';
const memberEmail = 'member@example.test';

describe('AccessReadRepository.listMembersAndAssignments', () => {
  const repository = new AccessReadRepository(dataSource);

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it("returns each member's normalized email via the accounts.user_id join", async () => {
    const manager = dataSource.manager;
    await manager.getRepository(WorkspaceEntity).insert({
      id: workspaceId,
      name: null,
      createdAt: now,
      updatedAt: now,
    });
    await manager.getRepository(WarehouseEntity).insert({
      id: warehouseId,
      workspaceId,
      name: 'Warehouse A',
      createdAt: now,
      updatedAt: now,
    });
    await manager.getRepository(RoleEntity).insert({
      id: roleId,
      warehouseId,
      name: 'Custom Role',
      kind: 'custom',
      createdAt: now,
      updatedAt: now,
    });
    // `accounts.user_id` / `users.account_id` form a deferred circular FK
    // pair, so both inserts must run inside one transaction (see
    // member-lifecycle.repository.integration.spec.ts for the same pattern).
    await dataSource.transaction(async (trxManager) => {
      await trxManager.getRepository(AccountEntity).insert({
        id: memberUserId,
        userId: memberUserId,
        normalizedEmail: memberEmail,
        passwordHash: 'synthetic-hash',
        passwordHashAlgorithm: 'scrypt',
        passwordHashParameters: { cost: 1_024 },
        createdAt: now,
        updatedAt: now,
      });
      await trxManager.getRepository(UserEntity).insert({
        id: memberUserId,
        accountId: memberUserId,
        workspaceId,
        createdAt: now,
        updatedAt: now,
      });
    });
    await manager.getRepository(WarehouseMembershipEntity).insert({
      userId: memberUserId,
      warehouseId,
      workspaceId,
      roleId,
      roleKind: 'custom',
      createdAt: now,
      updatedAt: now,
    });

    const rows = await repository.listMembersAndAssignments(warehouseId, 10);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: memberUserId,
      email: memberEmail,
    });
  });
});

const secondMemberUserId = '00000000-0000-4000-8000-000000000404';
const secondMemberEmail = 'second@example.test';

/**
 * `listRolesAndPermissions` left-joins `role_permissions` **and**
 * `warehouse_memberships`, so the two joins multiply into one row per
 * (permission, member) pair before the aggregate runs. Without `DISTINCT` the
 * permission array repeats every Permission once per assigned Member — a defect
 * that stays invisible while a Role has at most one Member, which is why the
 * fixtures below give one Role two of them.
 */
describe('AccessReadRepository.listRolesAndPermissions', () => {
  const repository = new AccessReadRepository(dataSource);

  const insertUser = async (id: string, email: string): Promise<void> => {
    // `accounts.user_id` / `users.account_id` form a deferred circular FK pair,
    // so both inserts must run inside one transaction.
    await dataSource.transaction(async (trxManager) => {
      await trxManager.getRepository(AccountEntity).insert({
        id,
        userId: id,
        normalizedEmail: email,
        passwordHash: 'synthetic-hash',
        passwordHashAlgorithm: 'scrypt',
        passwordHashParameters: { cost: 1_024 },
        createdAt: now,
        updatedAt: now,
      });
      await trxManager.getRepository(UserEntity).insert({
        id,
        accountId: id,
        workspaceId,
        createdAt: now,
        updatedAt: now,
      });
    });
  };

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('aggregates each Permission once however many Members hold the Role', async () => {
    const manager = dataSource.manager;
    await manager.getRepository(WorkspaceEntity).insert({
      id: workspaceId,
      name: null,
      createdAt: now,
      updatedAt: now,
    });
    await manager.getRepository(WarehouseEntity).insert({
      id: warehouseId,
      workspaceId,
      name: 'Warehouse A',
      createdAt: now,
      updatedAt: now,
    });
    await manager.getRepository(RoleEntity).insert({
      id: roleId,
      warehouseId,
      name: 'Custom Role',
      kind: 'custom',
      createdAt: now,
      updatedAt: now,
    });
    await manager.getRepository(RolePermissionEntity).insert([
      {
        roleId,
        permissionId: 'ROLES:WATCH',
        roleKind: 'custom',
        permissionKind: 'assignable',
      },
      {
        roleId,
        permissionId: 'USERS:WATCH',
        roleKind: 'custom',
        permissionKind: 'assignable',
      },
    ]);

    await insertUser(memberUserId, memberEmail);
    await insertUser(secondMemberUserId, secondMemberEmail);
    await manager.getRepository(WarehouseMembershipEntity).insert(
      [memberUserId, secondMemberUserId].map((userId) => ({
        userId,
        warehouseId,
        workspaceId,
        roleId,
        roleKind: 'custom' as const,
        createdAt: now,
        updatedAt: now,
      })),
    );

    const rows = await repository.listRolesAndPermissions(warehouseId, 10);

    expect(rows).toHaveLength(1);
    // Two Permissions, not two copies of each, and the member count is counted
    // over distinct users rather than over the multiplied rows.
    expect(rows[0]?.permissionIds).toStrictEqual([
      'ROLES:WATCH',
      'USERS:WATCH',
    ]);
    expect(rows[0]?.assignedMemberCount).toBe(2);
  });
});
