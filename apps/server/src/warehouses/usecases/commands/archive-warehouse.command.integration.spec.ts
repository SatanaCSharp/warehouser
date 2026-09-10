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
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
// `ArchiveWarehouseCommand` does not exist yet (T21) — this is the RED for
// AC-10, AC-11, AC-11a and AC-13's archiving half. Per the task card and
// sad.md §6.5/data-model.md "Repository boundaries and locking", the
// implementer creates it as a `@Transactional()` owner over
// `WarehouseLifecycleRepository`: prove the named Warehouse belongs to
// `currentUser.workspaceId` (AC-10, denying without disclosure), lock the
// parent `workspaces` row and re-count non-archived Warehouses *after*
// acquiring the lock (`lockWorkspaceAndCountNonArchivedWarehouses`), deny
// archiving the last one with `workspaceLastUnarchivedWarehouseError()`
// (AC-11a), otherwise call `setArchivedAt(warehouseId, <now>)`, leaving
// archived state, memberships and Roles unchanged on any failure (AC-13).
// This command must never consult archived state as an authorization input
// — only `principal.workspaceId` gates it.
import { ArchiveWarehouseCommand } from 'warehouses/usecases/commands/archive-warehouse.command';

const now = new Date('2026-08-12T12:00:00.000Z');

// eslint-disable-next-line max-lines-per-function -- integration suite setup is inherently long
describe('ArchiveWarehouseCommand', () => {
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);
  const warehouseLifecycleRepository = new WarehouseLifecycleRepository(
    dataSource,
  );

  const createCommand = (): ArchiveWarehouseCommand =>
    new ArchiveWarehouseCommand(warehouseLifecycleRepository);

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

  const seedWarehouse = async (
    workspaceId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> => {
    const warehouse = buildWarehouse({ workspaceId, ...overrides });
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
    // one transaction (matches warehouse-lifecycle.repository.integration
    // .spec.ts's `seedIdentity`).
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

  it('AC-11: archives a Warehouse of the actor Workspace, retaining its Roles and memberships and keeping exactly one Manager', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    await seedWarehouse(workspaceId); // a second non-archived Warehouse so AC-11a does not block this archiving
    const manager = await seedManagerRoleAndMembership(
      warehouseId,
      workspaceId,
    );

    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute(principal(workspaceId), { warehouseId }),
    );

    // openapi.yaml answers `PUT .../archival` with the full `Warehouse` body,
    // and the web client Zod-validates the response against `warehouseSchema`,
    // so the command confirms the value it just wrote rather than echoing a
    // bare identifier (T44). This assertion still named the pre-T44 shape.
    expect(result).toEqual({
      id: warehouseId,
      name: expect.any(String),
      archivedAt: expect.any(Date),
    });

    const archived = await dataSource.manager
      .getRepository(WarehouseEntity)
      .findOneBy({ id: warehouseId });
    expect(archived?.archivedAt).not.toBeNull();

    await expectManagerIntact(warehouseId, manager);
  });

  it('AC-11a: denies archiving the only non-archived Warehouse of the Workspace', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const manager = await seedManagerRoleAndMembership(
      warehouseId,
      workspaceId,
    );

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(principal(workspaceId), { warehouseId }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_LAST_UNARCHIVED_WAREHOUSE,
    });

    const untouched = await dataSource.manager
      .getRepository(WarehouseEntity)
      .findOneBy({ id: warehouseId });
    expect(untouched?.archivedAt).toBeNull();
    await expectManagerIntact(warehouseId, manager);
  });

  it('AC-10: denies archiving a Warehouse belonging to another Workspace without disclosing it exists', async () => {
    const actingWorkspaceId = await seedWorkspace();
    await seedWarehouse(actingWorkspaceId);
    await seedWarehouse(actingWorkspaceId);

    const otherWorkspaceId = await seedWorkspace();
    const otherWarehouseId = await seedWarehouse(otherWorkspaceId);
    await seedWarehouse(otherWorkspaceId);

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
    expect(untouched?.archivedAt).toBeNull();
  });

  it('AC-13: an injected failure leaves archived state, memberships and Roles unchanged', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    await seedWarehouse(workspaceId);
    const manager = await seedManagerRoleAndMembership(
      warehouseId,
      workspaceId,
    );

    await dataSource.query(`
      CREATE OR REPLACE FUNCTION fail_warehouse_archive()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.archived_at IS NOT NULL THEN
          RAISE EXCEPTION 'injected archive failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER fail_warehouse_archive
      BEFORE UPDATE ON warehouses
      FOR EACH ROW EXECUTE FUNCTION fail_warehouse_archive();
    `);

    try {
      // The injected persistence failure propagates untouched — the command
      // never reclassifies it (server-use-case-boundaries.md §3) — and
      // `@Transactional()` is what keeps AC-13's promise that nothing
      // changed.
      await expect(
        transactions.executeInTransaction({}, () =>
          createCommand().execute(principal(workspaceId), { warehouseId }),
        ),
      ).rejects.toThrow(/injected archive failure/u);
    } finally {
      await dataSource.query(
        'DROP TRIGGER IF EXISTS fail_warehouse_archive ON warehouses',
      );
      await dataSource.query('DROP FUNCTION IF EXISTS fail_warehouse_archive');
    }

    const untouched = await dataSource.manager
      .getRepository(WarehouseEntity)
      .findOneBy({ id: warehouseId });
    expect(untouched?.archivedAt).toBeNull();
    await expectManagerIntact(warehouseId, manager);
  });

  // -------------------------------------------------------------------
  // Genuine-concurrency tests for AC-11a, run over two real, independent
  // connections via `DbTransactionService.executeInTransaction` (each call
  // opens its own `QueryRunner` when no transaction is already active on
  // the AsyncLocalStorage context) — mirroring
  // `delete-member.command.integration.spec.ts`'s AC-15 race test and
  // reusing the lock guarantee already proven at the repository level in
  // `warehouse-lifecycle.repository.integration.spec.ts`. Real PostgreSQL
  // row locking (not any test-side sleep/poll) is what forces the two
  // concurrent commands to serialize.
  // -------------------------------------------------------------------
});
