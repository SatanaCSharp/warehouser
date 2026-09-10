import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
// `WarehouseLifecycleRepository` does not exist yet (T11) — this is the RED
// for AC-11a and the archive/restore half of AC-11. The implementer creates
// it per docs/system/guides/creating-a-server-repository.md (data-model.md
// "Repository boundaries, transactions and locking"): create/rename a
// Warehouse, set/clear `archived_at`, and the locked non-archived re-count —
// lock the parent `workspaces` row (`pessimistic_write`), then
// `SELECT count(*) FROM warehouses WHERE workspace_id = $1 AND archived_at IS
// NULL`, so no phantom from a concurrent create or archive can be seen. Do
// not add a trigger or check constraint for this rule
// (data-model.md "Constraints deliberately not expressed in the schema").
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import {
  buildWarehouseMembership,
  buildWorkspace,
} from 'test/factories/entity-factories';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const now = new Date('2026-08-12T12:00:00.000Z');

// The shape this RED step expects the implementer to expose
// (data-model.md "Repository boundaries", task card T11).
// `WarehouseLifecycleRepository` is `error`-typed while its module does not
// exist yet, so every call below goes through this one cast rather than
// letting that `error` type leak into every assertion.
interface WarehouseWrite {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
}
interface WarehouseLifecycleRepositoryContract {
  createWarehouse(input: WarehouseWrite): Promise<void>;
  renameWarehouse(warehouseId: string, name: string): Promise<void>;
  setArchivedAt(warehouseId: string, archivedAt: Date | null): Promise<void>;
  lockWorkspaceAndCountNonArchivedWarehouses(
    workspaceId: string,
  ): Promise<number>;
}

const repository = new WarehouseLifecycleRepository(
  dataSource,
) as unknown as WarehouseLifecycleRepositoryContract;

const seedWorkspace = async (): Promise<string> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  return workspace.id as string;
};

const seedIdentity = async (
  userId: string,
  workspaceId: string,
  normalizedEmail: string,
): Promise<void> => {
  // `fk_users_workspace_id` is `DEFERRABLE INITIALLY DEFERRED` — the check
  // only fires at this transaction's own commit, so both inserts must land
  // inside the same transaction (see manager-transfer.repository.integration
  // .spec.ts for the identical pattern).
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

interface LifecycleFixture {
  readonly workspaceId: string;
  readonly warehouseId: string;
  readonly managerRoleId: string;
  readonly memberUserId: string;
}

const seedCreatedAndRenamedWarehouse = async (): Promise<LifecycleFixture> => {
  const workspaceId = await seedWorkspace();
  const warehouseId = crypto.randomUUID();

  await repository.createWarehouse({
    id: warehouseId,
    workspaceId,
    name: 'Site One',
  });

  const created = await dataSource.manager
    .getRepository(WarehouseEntity)
    .findOneBy({ id: warehouseId });
  expect(created).toMatchObject({
    workspaceId,
    name: 'Site One',
    archivedAt: null,
  });

  await repository.renameWarehouse(warehouseId, 'Site One Renamed');
  const renamed = await dataSource.manager
    .getRepository(WarehouseEntity)
    .findOneBy({ id: warehouseId });
  expect(renamed?.name).toBe('Site One Renamed');

  // A Role and a membership into this Warehouse, so archiving's effect on
  // them (none) is observable rather than assumed.
  const managerRoleId = crypto.randomUUID();
  await dataSource.manager.getRepository(RoleEntity).insert({
    id: managerRoleId,
    warehouseId,
    name: 'Warehouse Manager',
    kind: 'warehouse_manager',
    createdAt: now,
    updatedAt: now,
  });
  const memberUserId = crypto.randomUUID();
  await seedIdentity(
    memberUserId,
    workspaceId,
    `member.${memberUserId}@example.test`,
  );
  await dataSource.manager.getRepository(WarehouseMembershipEntity).insert(
    buildWarehouseMembership({
      userId: memberUserId,
      warehouseId,
      workspaceId,
      roleId: managerRoleId,
      roleKind: 'warehouse_manager',
    }),
  );

  return { workspaceId, warehouseId, managerRoleId, memberUserId };
};

const expectRoleAndMembershipIntact = async (
  fixture: LifecycleFixture,
): Promise<void> => {
  const role = await dataSource.manager
    .getRepository(RoleEntity)
    .findOneBy({ id: fixture.managerRoleId });
  expect(role).toMatchObject({
    warehouseId: fixture.warehouseId,
    kind: 'warehouse_manager',
  });

  const membership = await dataSource.manager
    .getRepository(WarehouseMembershipEntity)
    .findOneBy({
      userId: fixture.memberUserId,
      warehouseId: fixture.warehouseId,
    });
  expect(membership).toMatchObject({
    roleId: fixture.managerRoleId,
    roleKind: 'warehouse_manager',
  });
};

const verifyCreateRenameArchiveRestore = async (): Promise<void> => {
  const fixture = await seedCreatedAndRenamedWarehouse();

  // `createWarehouse` stamps `createdAt` from the real clock, so the archival
  // instant is derived from the stored row rather than the suite's frozen
  // clock: `chk_warehouses_archival_order` rejects an archival that predates
  // creation, which a fixed timestamp does once wall time passes it.
  const beforeArchive = await dataSource.manager
    .getRepository(WarehouseEntity)
    .findOneBy({ id: fixture.warehouseId });
  expect(beforeArchive?.createdAt).toBeInstanceOf(Date);
  const archivedAt = new Date(
    (beforeArchive?.createdAt ?? now).getTime() + 60_000,
  );
  await repository.setArchivedAt(fixture.warehouseId, archivedAt);

  const archived = await dataSource.manager
    .getRepository(WarehouseEntity)
    .findOneBy({ id: fixture.warehouseId });
  expect(archived?.archivedAt?.toISOString()).toBe(archivedAt.toISOString());
  // Everything else about the record — including its rename — is unaffected
  // by archiving.
  expect(archived?.name).toBe('Site One Renamed');
  await expectRoleAndMembershipIntact(fixture);

  await repository.setArchivedAt(fixture.warehouseId, null);
  const restored = await dataSource.manager
    .getRepository(WarehouseEntity)
    .findOneBy({ id: fixture.warehouseId });
  expect(restored?.archivedAt).toBeNull();
  await expectRoleAndMembershipIntact(fixture);
};

describe('WarehouseLifecycleRepository', () => {
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

  describe('create, rename, archive and restore', () => {
    it(
      'creates a Warehouse in a Workspace, renames it, and archiving/restoring only touches its archived state while its Roles, memberships and records survive untouched (AC-11)',
      verifyCreateRenameArchiveRestore,
    );
  });
});
