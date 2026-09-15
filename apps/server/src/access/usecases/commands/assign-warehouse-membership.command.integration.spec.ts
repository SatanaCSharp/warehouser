import { randomUUID } from 'node:crypto';

import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
// `AssignWarehouseMembershipCommand` does not exist yet (T22) — this is the
// RED for AC-23, AC-24, AC-25 and AC-25a. Per the task card, spec.md §5 and
// sad.md §6.6, the implementer creates it as a `@Transactional()` owner
// under `WAREHOUSE_MEMBERSHIPS:ASSIGN`: prove the target belongs to
// `currentUser.workspaceId` and the Warehouse belongs to that same Workspace
// (AC-24, `workspaceTargetUnavailableError` — both failures indistinguishable
// per the shared `WORKSPACE_TARGET_UNAVAILABLE` factory), refuse the actor
// targeting themself (AC-25a, `workspaceSelfActionDeniedError`), refuse the
// protected Warehouse Manager Role as the chosen Role
// (AC-25, `workspaceManagerTransferRequiredError`), refuse a second
// membership in a Warehouse the target already belongs to
// (AC-25, `workspaceMembershipExistsError`), and otherwise call
// `WarehouseMembershipAssignmentRepository.insertMembership`, carrying
// `workspace_id` (AC-23). The exact collaborators below
// (`WarehouseMembershipAssignmentRepository`, `WarehouseLifecycleRepository`,
// `WorkspaceMembershipRepository`) are this RED step's proposed wiring —
// the implementer may extend any of them with additional lock/read methods
// as the command needs.
import { AssignWarehouseMembershipCommand } from 'access/usecases/commands/assign-warehouse-membership.command';
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
import { WarehouseMembershipAssignmentRepository } from 'shared/domain/repositories/warehouse-membership-assignment.repository';
import { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const now = new Date('2026-08-12T12:00:00.000Z');

interface AssignWarehouseMembershipInput {
  readonly targetUserId: string;
  readonly warehouseId: string;
  readonly roleId: string;
}
interface AssignWarehouseMembershipCommandContract {
  execute(
    currentUser: WorkspaceCurrentUser,
    input: AssignWarehouseMembershipInput,
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
const warehouseLifecycleRepository = new WarehouseLifecycleRepository(
  dataSource,
);
const workspaceMembershipRepository = new WorkspaceMembershipRepository(
  dataSource,
);

const createCommand = (): AssignWarehouseMembershipCommandContract =>
  new AssignWarehouseMembershipCommand(
    warehouseMembershipAssignmentRepository,
    warehouseLifecycleRepository,
    workspaceMembershipRepository,
  );

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
  permissionId: WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
});

const findMembership = (
  userId: string,
  warehouseId: string,
): Promise<WarehouseMembershipEntity | null> =>
  dataSource.manager
    .getRepository(WarehouseMembershipEntity)
    .findOneBy({ userId, warehouseId });

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

describe('AssignWarehouseMembershipCommand — happy', () => {
  it('AC-23: the target holds exactly the chosen custom Role in that Warehouse and keeps every membership already held', async () => {
    const workspaceId = await seedWorkspace();
    const actorId = randomUUID();
    await seedIdentity(actorId, workspaceId, `actor.${actorId}@example.test`);
    const targetId = randomUUID();
    await seedIdentity(
      targetId,
      workspaceId,
      `target.${targetId}@example.test`,
    );

    // The target already belongs to a different Warehouse of this
    // Workspace — proves the prior membership survives the new grant.
    const otherWarehouseId = await seedWarehouse(workspaceId);
    const otherRoles = await seedRoles(otherWarehouseId);
    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
      userId: targetId,
      warehouseId: otherWarehouseId,
      workspaceId,
      roleId: otherRoles.customRoleId,
      roleKind: 'custom',
      createdAt: now,
      updatedAt: now,
    });

    const warehouseId = await seedWarehouse(workspaceId);
    const { customRoleId } = await seedRoles(warehouseId);

    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute(principal(workspaceId, actorId), {
        targetUserId: targetId,
        warehouseId,
        roleId: customRoleId,
      }),
    );

    expect(result).toMatchObject({
      userId: targetId,
      warehouseId,
      roleId: customRoleId,
    });

    const membership = await findMembership(targetId, warehouseId);
    expect(membership).toMatchObject({
      roleId: customRoleId,
      roleKind: 'custom',
      workspaceId,
    });

    const priorMembership = await findMembership(targetId, otherWarehouseId);
    expect(priorMembership).toMatchObject({ roleId: otherRoles.customRoleId });
  });
});

describe('AssignWarehouseMembershipCommand — cross-context', () => {
  it("AC-24: denies placing a User of another Workspace into one of the actor's Warehouses", async () => {
    const workspaceId = await seedWorkspace();
    const actorId = randomUUID();
    await seedIdentity(actorId, workspaceId, `actor.${actorId}@example.test`);
    const warehouseId = await seedWarehouse(workspaceId);
    const { customRoleId } = await seedRoles(warehouseId);

    const otherWorkspaceId = await seedWorkspace();
    const foreignUserId = randomUUID();
    await seedIdentity(
      foreignUserId,
      otherWorkspaceId,
      `foreign.${foreignUserId}@example.test`,
    );

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(principal(workspaceId, actorId), {
          targetUserId: foreignUserId,
          warehouseId,
          roleId: customRoleId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE });

    await expect(
      findMembership(foreignUserId, warehouseId),
    ).resolves.toBeNull();
  });

  it("AC-24: denies placing a User of the actor's Workspace into a Warehouse of another Workspace", async () => {
    const workspaceId = await seedWorkspace();
    const actorId = randomUUID();
    await seedIdentity(actorId, workspaceId, `actor.${actorId}@example.test`);
    const targetId = randomUUID();
    await seedIdentity(
      targetId,
      workspaceId,
      `target.${targetId}@example.test`,
    );

    const otherWorkspaceId = await seedWorkspace();
    const foreignWarehouseId = await seedWarehouse(otherWorkspaceId);
    const { customRoleId: foreignRoleId } = await seedRoles(foreignWarehouseId);

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(principal(workspaceId, actorId), {
          targetUserId: targetId,
          warehouseId: foreignWarehouseId,
          roleId: foreignRoleId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE });

    await expect(
      findMembership(targetId, foreignWarehouseId),
    ).resolves.toBeNull();
  });
});

describe('AssignWarehouseMembershipCommand — domain invariant', () => {
  it('AC-25: denies granting the protected Warehouse Manager Role through ordinary assignment', async () => {
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
    const { managerRoleId } = await seedRoles(warehouseId);

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(principal(workspaceId, actorId), {
          targetUserId: targetId,
          warehouseId,
          roleId: managerRoleId,
        }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_MANAGER_TRANSFER_REQUIRED,
    });

    await expect(findMembership(targetId, warehouseId)).resolves.toBeNull();
  });

  it('AC-25: denies granting a second membership in a Warehouse the target already belongs to', async () => {
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
    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
      userId: targetId,
      warehouseId,
      workspaceId,
      roleId: customRoleId,
      roleKind: 'custom',
      createdAt: now,
      updatedAt: now,
    });

    const secondRoleId = randomUUID();
    await dataSource.manager.getRepository(RoleEntity).insert({
      id: secondRoleId,
      warehouseId,
      name: 'Receiver',
      kind: 'custom',
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(principal(workspaceId, actorId), {
          targetUserId: targetId,
          warehouseId,
          roleId: secondRoleId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_MEMBERSHIP_EXISTS });

    const membership = await findMembership(targetId, warehouseId);
    expect(membership).toMatchObject({ roleId: customRoleId });
  });

  it('AC-25a: denies the actor granting themself a membership in an existing Warehouse', async () => {
    const workspaceId = await seedWorkspace();
    const actorId = randomUUID();
    await seedIdentity(actorId, workspaceId, `actor.${actorId}@example.test`);
    const warehouseId = await seedWarehouse(workspaceId);
    const { customRoleId } = await seedRoles(warehouseId);

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(principal(workspaceId, actorId), {
          targetUserId: actorId,
          warehouseId,
          roleId: customRoleId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_SELF_ACTION_DENIED });

    await expect(findMembership(actorId, warehouseId)).resolves.toBeNull();
  });
});
