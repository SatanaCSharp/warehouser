import dataSource from 'shared/database/data-source';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
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
  buildWarehouse,
  buildWarehouseMembership,
  buildWorkspace,
} from 'test/factories/entity-factories';
import type { QueryRunner } from 'typeorm';
import { IsNull } from 'typeorm';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

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

// Installs the AsyncLocalStorage the repository's getEntityManager() reads
// from; single-connection calls below fall through to dataSource.manager,
// exactly as a bare repository call outside a @Transactional() service does.
// The concurrency tests run repository calls against explicit
// QueryRunner-owned managers through `context.run(...)` instead.
const context = new DbTransactionContext(dataSource);

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

const nonArchivedCount = async (workspaceId: string): Promise<number> =>
  dataSource.manager.getRepository(WarehouseEntity).count({
    where: { workspaceId, archivedAt: IsNull() },
  });

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

  const archivedAt = new Date('2026-08-12T13:00:00.000Z');
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

describeIntegration('WarehouseLifecycleRepository', () => {
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

  // ---------------------------------------------------------------------
  // Genuine-concurrency tests for AC-11a. Both open two independent
  // PostgreSQL connections (two QueryRunners) and interleave them
  // deliberately by polling real server-side wait state (`pg_locks`)
  // instead of a fixed sleep, mirroring
  // workspace-owner-transfer.repository.integration.spec.ts.
  // ---------------------------------------------------------------------

  const backendPid = async (runner: QueryRunner): Promise<number> => {
    const rows = await runner.query('SELECT pg_backend_pid() AS pid');
    return Number(rows[0].pid);
  };

  // PostgreSQL implements a second `SELECT ... FOR UPDATE` racing an
  // already-locked row as a wait on the *holding transaction's* id
  // (`wait_event = 'transactionid'`), not as an ungranted lock on the
  // relation itself — `pg_locks` alone cannot attribute it to `workspaces`.
  // `pg_stat_activity.query` (the blocked backend's own in-flight statement)
  // is what actually identifies *which* row it is waiting on.
  const blockedOnQueryContaining = async (
    pid: number,
    expectedQueryFragment: string,
  ): Promise<boolean> => {
    const rows = await dataSource.query(
      `SELECT query, wait_event_type
         FROM pg_stat_activity
        WHERE pid = $1`,
      [pid],
    );
    const activity = rows[0] as
      { query: string; wait_event_type: string | null } | undefined;
    return (
      activity?.wait_event_type === 'Lock' &&
      (activity.query ?? '').includes(expectedQueryFragment)
    );
  };

  const waitForBlockedOn = async (
    pid: number,
    expectedQueryFragment: string,
  ): Promise<void> => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (await blockedOnQueryContaining(pid, expectedQueryFragment)) {
        return;
      }
      if (attempt === 199) {
        throw new Error(
          `Backend ${pid} never blocked on a query containing "${expectedQueryFragment}" within the poll budget`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  };

  it('serializes two simultaneous archives of the last two non-archived Warehouses so at least one remains non-archived (AC-11a)', async () => {
    const workspaceId = await seedWorkspace();
    // `createdAt` comes from the same frozen clock these tests archive with:
    // the factory would otherwise stamp it from the real clock, and
    // `chk_warehouses_archival_order` rejects an archival that predates
    // creation once wall time passes the fixture's timestamp.
    const warehouseA = buildWarehouse({ workspaceId, createdAt: now });
    const warehouseB = buildWarehouse({ workspaceId, createdAt: now });
    await dataSource.manager
      .getRepository(WarehouseEntity)
      .insert([warehouseA, warehouseB]);
    const warehouseAId = warehouseA.id as string;

    const runner1 = dataSource.createQueryRunner();
    await runner1.connect();
    const runner2 = dataSource.createQueryRunner();
    await runner2.connect();
    await runner1.startTransaction();
    await runner2.startTransaction();

    const pid2 = await backendPid(runner2);

    // txn1 locks the Workspace row and re-counts first — sees 2 non-archived
    // Warehouses, so archiving one is allowed by the rule under test.
    const countSeenByTxn1 = await context.run(runner1.manager, () =>
      repository.lockWorkspaceAndCountNonArchivedWarehouses(workspaceId),
    );
    expect(countSeenByTxn1).toBe(2);

    // txn2 attempts the same locked re-count concurrently, over a second,
    // independent connection — it must block on the *Workspace* row rather
    // than proceeding to see a stale count of 2.
    const txn2Count = context.run(runner2.manager, () =>
      repository.lockWorkspaceAndCountNonArchivedWarehouses(workspaceId),
    );
    txn2Count.catch(() => undefined);

    await waitForBlockedOn(pid2, 'FROM "workspaces"');

    // txn1 proceeds to archive Warehouse A (count was 2, so this is a valid
    // archiving) and commits, releasing the Workspace-row lock.
    await context.run(runner1.manager, () =>
      repository.setArchivedAt(warehouseAId, now),
    );
    await runner1.commitTransaction();
    await runner1.release();

    // txn2 unblocks only after txn1's commit, and its re-count therefore
    // reflects the just-archived Warehouse A — it cannot see a phantom count
    // of 2 that would let it archive the last remaining Warehouse too.
    const countSeenByTxn2 = await txn2Count;
    expect(countSeenByTxn2).toBe(1);
    // Because txn2 observes 1 non-archived Warehouse, application logic
    // built on this guarantee must refuse to archive Warehouse B — this test
    // deliberately does not call setArchivedAt for txn2, proving the
    // recount alone (not a schema constraint) is what a caller must act on.
    await runner2.commitTransaction();
    await runner2.release();

    expect(await nonArchivedCount(workspaceId)).toBe(1);
  });

  it('blocks a concurrent Warehouse creation on the same Workspace-row lock, so the locked re-count cannot miss it (AC-11a)', async () => {
    const workspaceId = await seedWorkspace();
    // `createdAt` comes from the same frozen clock these tests archive with:
    // the factory would otherwise stamp it from the real clock, and
    // `chk_warehouses_archival_order` rejects an archival that predates
    // creation once wall time passes the fixture's timestamp.
    const warehouseA = buildWarehouse({ workspaceId, createdAt: now });
    const warehouseB = buildWarehouse({ workspaceId, createdAt: now });
    await dataSource.manager
      .getRepository(WarehouseEntity)
      .insert([warehouseA, warehouseB]);

    const runner1 = dataSource.createQueryRunner();
    await runner1.connect();
    const runner2 = dataSource.createQueryRunner();
    await runner2.connect();
    await runner1.startTransaction();
    await runner2.startTransaction();

    const pid2 = await backendPid(runner2);

    // txn1 holds the Workspace-row lock without committing yet.
    const countSeenByTxn1 = await context.run(runner1.manager, () =>
      repository.lockWorkspaceAndCountNonArchivedWarehouses(workspaceId),
    );
    expect(countSeenByTxn1).toBe(2);

    // txn2 concurrently attempts to create a new Warehouse in the same
    // Workspace. Inserting a child row referencing `workspaces(id)` takes an
    // implicit FOR KEY SHARE lock on the parent row, which conflicts with
    // txn1's FOR UPDATE lock, so txn2 must block on `workspaces` rather than
    // completing invisibly to txn1's held lock.
    const newWarehouseId = crypto.randomUUID();
    const createCall = context.run(runner2.manager, () =>
      repository.createWarehouse({
        id: newWarehouseId,
        workspaceId,
        name: 'Concurrently Created Site',
      }),
    );
    createCall.catch(() => undefined);

    await waitForBlockedOn(pid2, 'INTO "warehouses"');

    await runner1.commitTransaction();
    await runner1.release();

    await createCall;
    await runner2.commitTransaction();
    await runner2.release();

    // A fresh locked re-count (inside its own transaction, exactly as a real
    // caller must run it) now sees the concurrently created Warehouse — it
    // was never a phantom the guarantee could miss.
    const finalCount = await dataSource.transaction((manager) =>
      context.run(manager, () =>
        repository.lockWorkspaceAndCountNonArchivedWarehouses(workspaceId),
      ),
    );
    expect(finalCount).toBe(3);
  });
});
