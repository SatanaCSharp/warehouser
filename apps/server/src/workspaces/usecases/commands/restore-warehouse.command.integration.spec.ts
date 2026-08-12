import { randomUUID } from 'node:crypto';

import { ErrorCode } from '@warehouser/shared-types/enums';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import {
  buildWarehouse,
  buildWarehouseMembership,
  buildWorkspace,
} from 'test/factories/entity-factories';
// `RestoreWarehouseCommand` does not exist yet (T21) — this is the RED for
// AC-10, AC-11's restore half, and AC-13's restore half. Per the task card
// and sad.md §6.5, the implementer creates it as a `@Transactional()` owner
// over `WarehouseLifecycleRepository`: prove the named Warehouse belongs to
// `currentUser.workspaceId` (AC-10, denying without disclosure), then call
// `setArchivedAt(warehouseId, null)`, making the Warehouse selectable and
// operable again with its Roles and memberships intact, and leaving
// archived state, memberships and Roles unchanged on any failure (AC-13).
// Restoring never re-counts non-archived Warehouses — AC-11a only bounds
// archiving — and this command must never consult archived state as an
// authorization input.
import { RestoreWarehouseCommand } from 'workspaces/usecases/commands/restore-warehouse.command';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-12T12:00:00.000Z');

// The shape this RED step expects the implementer to expose. Typed
// explicitly (rather than left `error`-typed while the module does not yet
// exist) so every call below goes through this one cast, matching
// warehouse-lifecycle.repository.integration.spec.ts's convention.
interface RestoreWarehouseInput {
  readonly warehouseId: string;
}
interface RestoreWarehouseResult {
  readonly warehouseId: string;
}
interface RestoreWarehouseCommandContract {
  execute(
    currentUser: WorkspaceCurrentUser,
    input: RestoreWarehouseInput,
  ): Promise<RestoreWarehouseResult>;
}

describeIntegration('RestoreWarehouseCommand', () => {
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);
  const warehouseLifecycleRepository = new WarehouseLifecycleRepository(
    dataSource,
  );

  const createCommand = (): RestoreWarehouseCommandContract =>
    new RestoreWarehouseCommand(warehouseLifecycleRepository);

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

  const seedWorkspace = async (): Promise<string> => {
    const workspace = buildWorkspace();
    await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
    return workspace.id as string;
  };

  const seedArchivedWarehouse = async (
    workspaceId: string,
  ): Promise<string> => {
    // `createdAt` comes from the same frozen clock as `archivedAt`: the factory
    // would otherwise stamp it from the real clock, and
    // `chk_warehouses_archival_order` rejects an archival that predates
    // creation once wall time passes the fixture's timestamp.
    const warehouse = buildWarehouse({
      workspaceId,
      createdAt: now,
      archivedAt: now,
    });
    await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);
    return warehouse.id as string;
  };

  const seedIdentity = async (
    userId: string,
    workspaceId: string,
    normalizedEmail: string,
  ): Promise<void> => {
    // `fk_users_workspace_id` is `DEFERRABLE INITIALLY DEFERRED` — only
    // checked at this transaction's own commit, so both inserts run inside
    // one transaction.
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

  interface ManagerFixture {
    readonly roleId: string;
    readonly userId: string;
  }

  const seedManagerRoleAndMembership = async (
    warehouseId: string,
    workspaceId: string,
  ): Promise<ManagerFixture> => {
    const roleId = randomUUID();
    await dataSource.manager.getRepository(RoleEntity).insert({
      id: roleId,
      warehouseId,
      name: 'Warehouse Manager',
      kind: 'warehouse_manager',
      createdAt: now,
      updatedAt: now,
    });

    const userId = randomUUID();
    await seedIdentity(userId, workspaceId, `manager.${userId}@example.test`);
    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert(
      buildWarehouseMembership({
        userId,
        warehouseId,
        workspaceId,
        roleId,
        roleKind: 'warehouse_manager',
      }),
    );

    return { roleId, userId };
  };

  const principal = (workspaceId: string): WorkspaceCurrentUser => ({
    userId: randomUUID(),
    workspaceId,
    workspaceRoleId: randomUUID(),
    workspaceRoleKind: 'custom',
    permissionId: 'WAREHOUSES:ARCHIVE',
  });

  const expectManagerIntact = async (
    warehouseId: string,
    fixture: ManagerFixture,
  ): Promise<void> => {
    const role = await dataSource.manager
      .getRepository(RoleEntity)
      .findOneBy({ id: fixture.roleId });
    expect(role).toMatchObject({ warehouseId, kind: 'warehouse_manager' });

    const membership = await dataSource.manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy({ userId: fixture.userId, warehouseId });
    expect(membership).toMatchObject({
      roleId: fixture.roleId,
      roleKind: 'warehouse_manager',
    });

    const managerCount = await dataSource.manager
      .getRepository(WarehouseMembershipEntity)
      .count({ where: { warehouseId, roleKind: 'warehouse_manager' } });
    expect(managerCount).toBe(1);
  };

  it('AC-11: restores an archived Warehouse of the actor Workspace, making it operable again with its Roles and memberships intact', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedArchivedWarehouse(workspaceId);
    const manager = await seedManagerRoleAndMembership(
      warehouseId,
      workspaceId,
    );

    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute(principal(workspaceId), { warehouseId }),
    );

    expect(result).toMatchObject({ warehouseId });

    const restored = await dataSource.manager
      .getRepository(WarehouseEntity)
      .findOneBy({ id: warehouseId });
    expect(restored?.archivedAt).toBeNull();

    await expectManagerIntact(warehouseId, manager);
  });

  it('AC-10: denies restoring a Warehouse belonging to another Workspace without disclosing it exists', async () => {
    const actingWorkspaceId = await seedWorkspace();
    await seedArchivedWarehouse(actingWorkspaceId);

    const otherWorkspaceId = await seedWorkspace();
    const otherWarehouseId = await seedArchivedWarehouse(otherWorkspaceId);

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(principal(actingWorkspaceId), {
          warehouseId: otherWarehouseId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE });

    const untouched = await dataSource.manager
      .getRepository(WarehouseEntity)
      .findOneBy({ id: otherWarehouseId });
    expect(untouched?.archivedAt).not.toBeNull();
  });

  it('AC-13: an injected failure leaves archived state, memberships and Roles unchanged', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedArchivedWarehouse(workspaceId);
    const manager = await seedManagerRoleAndMembership(
      warehouseId,
      workspaceId,
    );

    await dataSource.query(`
      CREATE OR REPLACE FUNCTION fail_warehouse_restore()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.archived_at IS NULL THEN
          RAISE EXCEPTION 'injected restore failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER fail_warehouse_restore
      BEFORE UPDATE ON warehouses
      FOR EACH ROW EXECUTE FUNCTION fail_warehouse_restore();
    `);

    try {
      await expect(
        transactions.executeInTransaction({}, () =>
          createCommand().execute(principal(workspaceId), { warehouseId }),
        ),
      ).rejects.toThrow();
    } finally {
      await dataSource.query(
        'DROP TRIGGER IF EXISTS fail_warehouse_restore ON warehouses',
      );
      await dataSource.query('DROP FUNCTION IF EXISTS fail_warehouse_restore');
    }

    const untouched = await dataSource.manager
      .getRepository(WarehouseEntity)
      .findOneBy({ id: warehouseId });
    expect(untouched?.archivedAt).not.toBeNull();
    await expectManagerIntact(warehouseId, manager);
  });
});
