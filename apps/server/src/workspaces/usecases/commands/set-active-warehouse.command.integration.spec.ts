import { randomUUID } from 'node:crypto';

import { ErrorCode } from '@warehouser/shared-types/enums';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
// `ActiveWarehouseSelectionRepository` does not exist yet either — this is
// the RED step for T23's write half. Per sad.md §6.8 and data-model.md
// ("Constraints deliberately not expressed in the schema" — "The Active
// Warehouse is not archived"), the implementer owns one cohesive repository
// method that, inside the command's `@Transactional()` boundary: locks the
// (userId, warehouseId) `warehouse_memberships` row together with that
// Warehouse's `archived_at`, and only when a live, non-archived membership
// is found, updates `users.active_warehouse_id`. The command maps a missing
// membership to `workspaceTargetUnavailableError()`
// (ErrorCode.WORKSPACE_TARGET_UNAVAILABLE, matching
// contracts/openapi.yaml's 404 for this route) and an archived Warehouse to
// a named `workspace.warehouse_archived` error
// (ErrorCode.WORKSPACE_WAREHOUSE_ARCHIVED, matching the same contract's
// 409), leaving the stored selection untouched in both cases (AC-04).
import { ActiveWarehouseSelectionRepository } from 'shared/domain/repositories/active-warehouse-selection.repository';
import {
  buildWarehouse,
  buildWarehouseMembership,
  buildWorkspace,
} from 'test/factories/entity-factories';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
// `SetActiveWarehouseCommand` does not exist yet — this is the RED step for
// T23. This route is session-authenticated and declares no Workspace or
// Warehouse Permission (sad.md §6.8): the command itself proves a live,
// non-archived membership in the target Warehouse, so its input is the
// session's bare `userId`, not a `WorkspaceCurrentUser`. The selection is
// stored against the User row (`users.active_warehouse_id`), never a
// session/device, so it is what "survives a new session" means here — there
// is no cookie/session-claim copy to go stale (spec.md §6.1 "Stale
// selection").
import { SetActiveWarehouseCommand } from 'workspaces/usecases/commands/set-active-warehouse.command';

const now = new Date('2026-08-12T12:00:00.000Z');

interface SetActiveWarehouseInput {
  readonly warehouseId: string;
}
interface SetActiveWarehouseResult {
  readonly effectiveWarehouseId: string;
}
interface SetActiveWarehouseCommandContract {
  execute(
    userId: string,
    input: SetActiveWarehouseInput,
  ): Promise<SetActiveWarehouseResult>;
}

describe('SetActiveWarehouseCommand', () => {
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);
  const activeWarehouseSelectionRepository =
    new ActiveWarehouseSelectionRepository(dataSource);

  const createCommand = (): SetActiveWarehouseCommandContract =>
    new SetActiveWarehouseCommand(activeWarehouseSelectionRepository);

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
    // `createdAt` comes from the same frozen clock as any fixture-supplied
    // `archivedAt`: `buildWarehouse` would otherwise stamp `createdAt` from
    // the real clock, and `chk_warehouses_archival_order` rejects an
    // archival that predates creation once wall time passes this fixture's
    // timestamp (same fix as `restore-warehouse.command.integration.spec.ts`).
    const warehouse = buildWarehouse({
      workspaceId,
      createdAt: now,
      ...overrides,
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
    // one transaction (matches every other workspaces integration spec's
    // `seedIdentity`).
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

  const seedMembership = async (
    userId: string,
    warehouseId: string,
    workspaceId: string,
  ): Promise<void> => {
    const roleId = randomUUID();
    await dataSource.manager.getRepository(RoleEntity).insert({
      id: roleId,
      warehouseId,
      name: 'Custom Warehouse Role',
      kind: 'custom',
      createdAt: now,
      updatedAt: now,
    });
    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert(
      buildWarehouseMembership({
        userId,
        warehouseId,
        workspaceId,
        roleId,
      }),
    );
  };

  const readStoredSelection = (userId: string): Promise<string | null> =>
    dataSource.manager
      .getRepository(UserEntity)
      .findOneBy({ id: userId })
      .then((user) => user?.activeWarehouseId ?? null);

  it('AC-03: stores the selection against the member (not a session/device) and it persists until changed', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseAId = await seedWarehouse(workspaceId);
    const warehouseBId = await seedWarehouse(workspaceId);
    const userId = randomUUID();
    await seedIdentity(userId, workspaceId, `member.${userId}@example.test`);
    await seedMembership(userId, warehouseAId, workspaceId);
    await seedMembership(userId, warehouseBId, workspaceId);

    const first = await transactions.executeInTransaction({}, () =>
      createCommand().execute(userId, { warehouseId: warehouseAId }),
    );
    expect(first).toMatchObject({ effectiveWarehouseId: warehouseAId });
    await expect(readStoredSelection(userId)).resolves.toBe(warehouseAId);

    // "Persists until changed" — a later, independent selection overwrites
    // the stored row rather than being appended anywhere; there is exactly
    // one User row and exactly one `active_warehouse_id` column, so a
    // second `SELECT` after a second command run is what "surviving a new
    // session" means here (no cookie/session copy exists to diverge from
    // it).
    const second = await transactions.executeInTransaction({}, () =>
      createCommand().execute(userId, { warehouseId: warehouseBId }),
    );
    expect(second).toMatchObject({ effectiveWarehouseId: warehouseBId });
    await expect(readStoredSelection(userId)).resolves.toBe(warehouseBId);
  });

  it('AC-04: denies selecting a Warehouse of the same Workspace the member holds no membership in, leaving the stored selection unchanged', async () => {
    const workspaceId = await seedWorkspace();
    const memberWarehouseId = await seedWarehouse(workspaceId);
    // A live (non-archived) Warehouse of the *same* Workspace the actor has
    // no membership in — isolating "no membership" from "archived" (both
    // are denied, but for different reasons and different codes below).
    const foreignWarehouseId = await seedWarehouse(workspaceId);
    const userId = randomUUID();
    await seedIdentity(userId, workspaceId, `member.${userId}@example.test`);
    await seedMembership(userId, memberWarehouseId, workspaceId);

    // Establish a prior selection first, so "unchanged" is a real assertion
    // rather than trivially true of an already-null column.
    await transactions.executeInTransaction({}, () =>
      createCommand().execute(userId, { warehouseId: memberWarehouseId }),
    );

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(userId, { warehouseId: foreignWarehouseId }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE });

    await expect(readStoredSelection(userId)).resolves.toBe(memberWarehouseId);
  });

  it('AC-04/AC-11: denies selecting an archived Warehouse the member holds a membership in, leaving the stored selection unchanged', async () => {
    const workspaceId = await seedWorkspace();
    const liveWarehouseId = await seedWarehouse(workspaceId);
    const archivedWarehouseId = await seedWarehouse(workspaceId, {
      archivedAt: now,
    });
    const userId = randomUUID();
    await seedIdentity(userId, workspaceId, `member.${userId}@example.test`);
    await seedMembership(userId, liveWarehouseId, workspaceId);
    await seedMembership(userId, archivedWarehouseId, workspaceId);

    await transactions.executeInTransaction({}, () =>
      createCommand().execute(userId, { warehouseId: liveWarehouseId }),
    );

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(userId, {
          warehouseId: archivedWarehouseId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_WAREHOUSE_ARCHIVED });

    await expect(readStoredSelection(userId)).resolves.toBe(liveWarehouseId);
  });
});
