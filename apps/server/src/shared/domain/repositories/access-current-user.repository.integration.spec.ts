import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';
import {
  buildWarehouse,
  buildWarehouseMembership,
  buildWorkspace,
} from 'test/factories/entity-factories';
import type { Logger } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const now = new Date('2026-08-12T12:00:00.000Z');

/**
 * Counts every query TypeORM executes through this data source while
 * installed, regardless of the `logging` option — `QueryRunner` calls
 * `connection.logger.logQuery` unconditionally (see
 * `PostgresQueryRunner.query`). Used to assert the Warehouse guard read
 * issues the same number of queries independent of how many Warehouse
 * memberships the acting User holds (spec.md §6, data-model.md §Indexes).
 */
class CountingLogger implements Logger {
  count = 0;
  logQuery(): void {
    this.count += 1;
  }
  logQueryError(): void {}
  logQuerySlow(): void {}
  logSchemaBuild(): void {}
  logMigration(): void {}
  log(): void {}
}

const persistUser = async (workspaceId: string): Promise<string> => {
  const userId = crypto.randomUUID();
  // accounts.user_id / users.account_id form a deferred circular FK pair, so
  // both inserts must land inside one transaction (see
  // member-lifecycle.repository.integration.spec.ts for the identical
  // pattern).
  await dataSource.transaction(async (trxManager) => {
    await trxManager.getRepository(AccountEntity).insert({
      id: userId,
      userId,
      normalizedEmail: `member.${userId}@example.test`,
      passwordHash: 'synthetic-hash',
      passwordHashAlgorithm: 'scrypt',
      passwordHashParameters: { cost: 1_024 },
      createdAt: now,
      updatedAt: now,
    });
    await trxManager.getRepository(UserEntity).insert({
      id: userId,
      accountId: userId,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    });
  });
  return userId;
};

const persistWorkspace = async (): Promise<string> => {
  const manager = dataSource.manager;
  const workspace = buildWorkspace();
  await manager.getRepository(WorkspaceEntity).insert(workspace);
  return workspace.id as string;
};

// A synthetic, catalogue-shaped identifier
// (`^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*$`) that does not collide with a real
// seeded Permission, mirroring `buildWorkspacePermission`'s approach in
// `test/factories/entity-factories.ts`.
const syntheticPermissionId = (): string =>
  `PERMISSIONS_FIXTURE:F${crypto.randomUUID().replace(/-/gu, '').toUpperCase()}`;

interface PersistedWarehouseWithRole {
  readonly warehouseId: string;
  readonly roleId: string;
  readonly permissionIds: readonly string[];
}

const persistWarehouseWithRole = async (
  workspaceId: string,
  grantedPermissionCount: number,
): Promise<PersistedWarehouseWithRole> => {
  const manager = dataSource.manager;
  const warehouse = buildWarehouse({ workspaceId });
  await manager.getRepository(WarehouseEntity).insert(warehouse);
  const warehouseId = warehouse.id as string;

  const roleId = crypto.randomUUID();
  await manager.getRepository(RoleEntity).insert({
    id: roleId,
    warehouseId,
    name: `Role ${roleId}`,
    kind: 'custom',
    createdAt: now,
    updatedAt: now,
  });

  const permissionIds = Array.from(
    { length: grantedPermissionCount },
    syntheticPermissionId,
  );

  if (permissionIds.length > 0) {
    await manager.getRepository(PermissionEntity).insert(
      permissionIds.map((id) => ({
        id,
        label: `Synthetic Permission fixture ${id}`,
        kind: 'assignable' as const,
        createdAt: now,
        updatedAt: now,
      })),
    );
    await manager.getRepository(RolePermissionEntity).insert(
      permissionIds.map((permissionId) => ({
        roleId,
        permissionId,
        roleKind: 'custom' as const,
        permissionKind: 'assignable' as const,
      })),
    );
  }

  return { warehouseId, roleId, permissionIds };
};

const persistWarehouseMembership = (
  userId: string,
  workspaceId: string,
  warehouse: PersistedWarehouseWithRole,
): Promise<unknown> =>
  dataSource.manager.getRepository(WarehouseMembershipEntity).insert(
    buildWarehouseMembership({
      userId,
      warehouseId: warehouse.warehouseId,
      workspaceId,
      roleId: warehouse.roleId,
    }),
  );

interface MemberWithMemberships {
  readonly userId: string;
  readonly targetWarehouseId: string;
  readonly targetPermissionId: string;
}

const buildMemberWithMemberships = async (
  workspaceId: string,
  membershipCount: number,
): Promise<MemberWithMemberships> => {
  const userId = await persistUser(workspaceId);
  let targetWarehouseId = '';
  let targetPermissionId = '';
  for (let index = 0; index < membershipCount; index += 1) {
    const warehouse = await persistWarehouseWithRole(workspaceId, 1);
    await persistWarehouseMembership(userId, workspaceId, warehouse);
    targetWarehouseId = warehouse.warehouseId;
    [targetPermissionId] = warehouse.permissionIds;
  }
  return { userId, targetWarehouseId, targetPermissionId };
};

describe('AccessCurrentUserRepository', () => {
  const repository = new AccessCurrentUserRepository(dataSource);

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, permissions, roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('resolves the (User, Warehouse) membership for the named Warehouse with its archived state', async () => {
    const workspaceId = await persistWorkspace();
    const userId = await persistUser(workspaceId);
    const warehouse = await persistWarehouseWithRole(workspaceId, 1);
    await persistWarehouseMembership(userId, workspaceId, warehouse);

    const result = await repository.resolveRequiredPermission(
      userId,
      warehouse.warehouseId,
      warehouse.permissionIds[0],
    );

    expect(result).toMatchObject({
      userId,
      warehouseId: warehouse.warehouseId,
      roleId: warehouse.roleId,
      granted: true,
      archivedAt: null,
    });
  });

  it('does not authorize a Permission held only through another Warehouse of the same Workspace (AC-05)', async () => {
    const workspaceId = await persistWorkspace();
    const userId = await persistUser(workspaceId);

    const grantingWarehouse = await persistWarehouseWithRole(workspaceId, 1);
    const namedWarehouse = await persistWarehouseWithRole(workspaceId, 0); // role with no grant
    await persistWarehouseMembership(userId, workspaceId, grantingWarehouse);
    await persistWarehouseMembership(userId, workspaceId, namedWarehouse);

    const result = await repository.resolveRequiredPermission(
      userId,
      namedWarehouse.warehouseId,
      grantingWarehouse.permissionIds[0],
    );

    expect(result?.granted).not.toBe(true);
  });

  it('never returns a Workspace Permission through the Warehouse read (AC-31)', async () => {
    const workspaceId = await persistWorkspace();
    const userId = await persistUser(workspaceId);
    const warehouse = await persistWarehouseWithRole(workspaceId, 0);
    await persistWarehouseMembership(userId, workspaceId, warehouse);

    // A Workspace Permission identifier (e.g. WORKSPACE:RENAME shape) is
    // simply absent from `role_permissions`, so this Warehouse-level read
    // can never grant it — the two catalogues are parallel and never joined
    // (ADR 0002, spec.md AC-31).
    const result = await repository.resolveRequiredPermission(
      userId,
      warehouse.warehouseId,
      'WORKSPACE:RENAME',
    );

    expect(result?.granted).not.toBe(true);
  });

  it('never consults the stored Active Warehouse selection as a fallback for a different named Warehouse', async () => {
    const workspaceId = await persistWorkspace();
    const userId = await persistUser(workspaceId);

    const selectedWarehouse = await persistWarehouseWithRole(workspaceId, 1);
    const unrelatedWarehouse = await persistWarehouseWithRole(workspaceId, 0);
    await persistWarehouseMembership(userId, workspaceId, selectedWarehouse);

    // The stored selection points at a Warehouse the User *does* hold the
    // Permission in, yet the request below names the other Warehouse, where
    // the User holds no membership at all.
    await dataSource.manager
      .getRepository(UserEntity)
      .update(
        { id: userId },
        { activeWarehouseId: selectedWarehouse.warehouseId },
      );

    const result = await repository.resolveRequiredPermission(
      userId,
      unrelatedWarehouse.warehouseId,
      selectedWarehouse.permissionIds[0],
    );

    expect(result).toBeNull();
  });

  it('issues the same number of queries regardless of how many Warehouse memberships the member holds', async () => {
    const workspaceId = await persistWorkspace();

    const few = await buildMemberWithMemberships(workspaceId, 1);
    const many = await buildMemberWithMemberships(workspaceId, 25);

    const originalLogger = dataSource.logger;

    const fewLogger = new CountingLogger();
    dataSource.logger = fewLogger;
    await repository.resolveRequiredPermission(
      few.userId,
      few.targetWarehouseId,
      few.targetPermissionId,
    );

    const manyLogger = new CountingLogger();
    dataSource.logger = manyLogger;
    await repository.resolveRequiredPermission(
      many.userId,
      many.targetWarehouseId,
      many.targetPermissionId,
    );

    dataSource.logger = originalLogger;

    expect(fewLogger.count).toBeGreaterThan(0);
    expect(manyLogger.count).toBe(fewLogger.count);
  });
});
