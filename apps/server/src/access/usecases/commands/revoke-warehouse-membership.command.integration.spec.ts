import { randomUUID } from 'node:crypto';

import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
// `RevokeWarehouseMembershipCommand` does not exist yet (T22) — this is the
// RED for AC-25b, AC-25c and AC-25d. Per the task card, spec.md §5 and
// sad.md §6.6, the implementer creates it as a `@Transactional()` owner
// under `WAREHOUSE_MEMBERSHIPS:REVOKE`: locate the target's membership row
// for the named Warehouse, deny without disclosure when it belongs to a
// Warehouse of another Workspace than the actor's
// (AC-25d, `workspaceTargetUnavailableError`), refuse withdrawing the
// protected Warehouse Manager's membership
// (AC-25c, `workspaceManagerTransferRequiredError`), refuse the actor
// withdrawing their own membership (AC-25c, `workspaceSelfActionDeniedError`),
// and otherwise call `WarehouseMembershipAssignmentRepository.deleteMembership`,
// which also nulls the target's `active_warehouse_id` when it pointed at
// that Warehouse (AC-25b) — every other membership stays untouched. The
// exact collaborator below (`WarehouseMembershipAssignmentRepository`) is
// this RED step's proposed wiring — the implementer may extend it with
// additional lock/read methods as the command needs.
import { RevokeWarehouseMembershipCommand } from 'access/usecases/commands/revoke-warehouse-membership.command';
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
import { WarehouseMembershipAssignmentRepository } from 'shared/domain/repositories/warehouse-membership-assignment.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const now = new Date('2026-08-12T12:00:00.000Z');

interface RevokeWarehouseMembershipInput {
  readonly targetUserId: string;
  readonly warehouseId: string;
}
interface RevokeWarehouseMembershipCommandContract {
  execute(
    currentUser: WorkspaceCurrentUser,
    input: RevokeWarehouseMembershipInput,
  ): Promise<unknown>;
}

// A hand-constructed command has no `@Transactional()` interceptor, so a
// pessimistic lock inside it throws `PessimisticLockTransactionRequiredError`
// unless the call runs inside an already-open transaction. `transactions`
// stands in for that interceptor here, matching
// archive-warehouse.command.integration.spec.ts.
const context = new DbTransactionContext(dataSource);
const transactions = new DbTransactionService(dataSource, context);
const warehouseMembershipAssignmentRepository =
  new WarehouseMembershipAssignmentRepository(dataSource);

const createCommand = (): RevokeWarehouseMembershipCommandContract =>
  new RevokeWarehouseMembershipCommand(warehouseMembershipAssignmentRepository);

const seedWorkspace = async (): Promise<string> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  return workspace.id as string;
};

const seedWarehouse = async (workspaceId: string): Promise<string> => {
  const warehouse = buildWarehouse({ workspaceId });
  await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);
  return warehouse.id as string;
};

const seedRoles = async (
  warehouseId: string,
): Promise<{ managerRoleId: string; customRoleId: string }> => {
  const managerRoleId = randomUUID();
  const customRoleId = randomUUID();
  await dataSource.manager.getRepository(RoleEntity).insert([
    {
      id: managerRoleId,
      warehouseId,
      name: 'Warehouse Manager',
      kind: 'warehouse_manager',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: customRoleId,
      warehouseId,
      name: 'Picker',
      kind: 'custom',
      createdAt: now,
      updatedAt: now,
    },
  ]);
  return { managerRoleId, customRoleId };
};

const seedIdentity = async (
  userId: string,
  workspaceId: string,
  normalizedEmail: string,
): Promise<void> => {
  // `fk_users_workspace_id` is `DEFERRABLE INITIALLY DEFERRED` — checked
  // only at this transaction's own commit, so both inserts run inside one
  // transaction (mirrors other integration specs in this directory).
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

const principal = (
  workspaceId: string,
  userId: string,
): WorkspaceCurrentUser => ({
  userId,
  workspaceId,
  workspaceRoleId: randomUUID(),
  workspaceRoleKind: 'custom',
  permissionId: WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_REVOKE,
});

const findMembership = (
  userId: string,
  warehouseId: string,
): Promise<WarehouseMembershipEntity | null> =>
  dataSource.manager
    .getRepository(WarehouseMembershipEntity)
    .findOneBy({ userId, warehouseId });

const insertMembership = async (
  userId: string,
  warehouseId: string,
  workspaceId: string,
  roleId: string,
  roleKind: 'custom' | 'warehouse_manager' = 'custom',
): Promise<void> => {
  await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
    userId,
    warehouseId,
    workspaceId,
    roleId,
    roleKind,
    createdAt: now,
    updatedAt: now,
  });
};

// One shared connection lifecycle for the whole file (top-level hooks,
// mirroring update-workspace-role.command.integration.spec.ts), so splitting
// the suite below into several `describe` blocks — purely to keep each body
// under the repo's `max-lines-per-function` cap — does not initialize or
// destroy `dataSource` more than once.
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

describe('RevokeWarehouseMembershipCommand — happy', () => {
  it('AC-25b: withdrawal removes the Role, stops selectability and leaves every other membership unaffected', async () => {
    const workspaceId = await seedWorkspace();
    const actorId = randomUUID();
    await seedIdentity(actorId, workspaceId, `actor.${actorId}@example.test`);
    const targetId = randomUUID();
    await seedIdentity(
      targetId,
      workspaceId,
      `target.${targetId}@example.test`,
    );

    const warehouseId = await seedWarehouse(workspaceId);
    const { customRoleId } = await seedRoles(warehouseId);
    await insertMembership(targetId, warehouseId, workspaceId, customRoleId);
    await dataSource.manager
      .getRepository(UserEntity)
      .update({ id: targetId }, { activeWarehouseId: warehouseId });

    // A second, unrelated membership for the same target — proves the
    // revocation is scoped to exactly the named Warehouse.
    const otherWarehouseId = await seedWarehouse(workspaceId);
    const otherRoles = await seedRoles(otherWarehouseId);
    await insertMembership(
      targetId,
      otherWarehouseId,
      workspaceId,
      otherRoles.customRoleId,
    );

    await transactions.executeInTransaction({}, () =>
      createCommand().execute(principal(workspaceId, actorId), {
        targetUserId: targetId,
        warehouseId,
      }),
    );

    await expect(findMembership(targetId, warehouseId)).resolves.toBeNull();

    const targetUser = await dataSource.manager
      .getRepository(UserEntity)
      .findOneBy({ id: targetId });
    expect(targetUser?.activeWarehouseId).toBeNull();

    const survivingMembership = await findMembership(
      targetId,
      otherWarehouseId,
    );
    expect(survivingMembership).toMatchObject({
      roleId: otherRoles.customRoleId,
    });
  });
});

describe('RevokeWarehouseMembershipCommand — domain invariant', () => {
  it("AC-25c: denies withdrawing the Warehouse Manager's membership", async () => {
    const workspaceId = await seedWorkspace();
    const actorId = randomUUID();
    await seedIdentity(actorId, workspaceId, `actor.${actorId}@example.test`);
    const managerId = randomUUID();
    await seedIdentity(
      managerId,
      workspaceId,
      `manager.${managerId}@example.test`,
    );

    const warehouseId = await seedWarehouse(workspaceId);
    const { managerRoleId } = await seedRoles(warehouseId);
    await insertMembership(
      managerId,
      warehouseId,
      workspaceId,
      managerRoleId,
      'warehouse_manager',
    );

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(principal(workspaceId, actorId), {
          targetUserId: managerId,
          warehouseId,
        }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_MANAGER_TRANSFER_REQUIRED,
    });

    const stillManager = await findMembership(managerId, warehouseId);
    expect(stillManager).toMatchObject({
      roleId: managerRoleId,
      roleKind: 'warehouse_manager',
    });
  });

  it('AC-25c: denies the actor withdrawing their own membership in a Warehouse', async () => {
    const workspaceId = await seedWorkspace();
    const actorId = randomUUID();
    await seedIdentity(actorId, workspaceId, `actor.${actorId}@example.test`);

    const warehouseId = await seedWarehouse(workspaceId);
    const { customRoleId } = await seedRoles(warehouseId);
    await insertMembership(actorId, warehouseId, workspaceId, customRoleId);

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(principal(workspaceId, actorId), {
          targetUserId: actorId,
          warehouseId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_SELF_ACTION_DENIED });

    const stillMember = await findMembership(actorId, warehouseId);
    expect(stillMember).toMatchObject({ roleId: customRoleId });
  });
});

describe('RevokeWarehouseMembershipCommand — cross-context', () => {
  it('AC-25d: denies withdrawing a membership in a Warehouse of another Workspace without disclosing it', async () => {
    const workspaceId = await seedWorkspace();
    const actorId = randomUUID();
    await seedIdentity(actorId, workspaceId, `actor.${actorId}@example.test`);

    const otherWorkspaceId = await seedWorkspace();
    const foreignUserId = randomUUID();
    await seedIdentity(
      foreignUserId,
      otherWorkspaceId,
      `foreign.${foreignUserId}@example.test`,
    );
    const foreignWarehouseId = await seedWarehouse(otherWorkspaceId);
    const { customRoleId: foreignRoleId } = await seedRoles(foreignWarehouseId);
    await insertMembership(
      foreignUserId,
      foreignWarehouseId,
      otherWorkspaceId,
      foreignRoleId,
    );

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(principal(workspaceId, actorId), {
          targetUserId: foreignUserId,
          warehouseId: foreignWarehouseId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE });

    const stillThere = await findMembership(foreignUserId, foreignWarehouseId);
    expect(stillThere).toMatchObject({ roleId: foreignRoleId });
  });
});
