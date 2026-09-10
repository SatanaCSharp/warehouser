import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
// `WarehouseMembershipAssignmentRepository` does not exist yet (T11) — this
// is the RED for AC-23a and the membership-write half of AC-24/AC-25b. The
// implementer creates it per
// docs/system/guides/creating-a-server-repository.md (data-model.md
// "Repository boundaries, transactions and locking"): the narrow
// assignable-Roles read (projected to `id, name` in SQL, not filtered after
// the fact, excluding the protected Warehouse Manager Role and constrained
// to one Warehouse of the actor's Workspace), membership insert (carrying
// `workspace_id`), and membership delete by the composite key.
import { WarehouseMembershipAssignmentRepository } from 'shared/domain/repositories/warehouse-membership-assignment.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const now = new Date('2026-08-12T12:00:00.000Z');

// The shape this RED step expects the implementer to expose (data-model.md
// "Repository boundaries", task card T11).
// `WarehouseMembershipAssignmentRepository` is `error`-typed while its module
// does not exist yet, so every call below goes through this one cast rather
// than letting that `error` type leak into every assertion.
interface AssignableRoleProjection {
  readonly id: string;
  readonly name: string;
}
interface MembershipWrite {
  readonly userId: string;
  readonly warehouseId: string;
  readonly workspaceId: string;
  readonly roleId: string;
  readonly roleKind: 'custom';
}
interface RoleRead {
  readonly id: string;
  readonly warehouseId: string;
  readonly name: string;
  readonly kind: 'custom' | 'warehouse_manager';
}
interface MembershipRead {
  readonly userId: string;
  readonly warehouseId: string;
  readonly workspaceId: string;
  readonly roleId: string;
  readonly roleKind: 'custom' | 'warehouse_manager';
}
interface WarehouseMembershipAssignmentRepositoryContract {
  readAssignableRoles(
    warehouseId: string,
    workspaceId: string,
  ): Promise<AssignableRoleProjection[]>;
  insertMembership(input: MembershipWrite): Promise<void>;
  deleteMembership(userId: string, warehouseId: string): Promise<void>;
  lockRole(warehouseId: string, roleId: string): Promise<RoleRead | null>;
  lockMembership(
    userId: string,
    warehouseId: string,
  ): Promise<MembershipRead | null>;
}

const repository = new WarehouseMembershipAssignmentRepository(
  dataSource,
) as unknown as WarehouseMembershipAssignmentRepositoryContract;
// `lockRole`/`lockMembership` take a pessimistic lock, which requires an
// already-open transaction outside the `@Transactional()` interceptor this
// hand-constructed repository never runs behind — `transactions` stands in
// for that interceptor, matching archive-warehouse.command.integration.spec.ts.
const context = new DbTransactionContext(dataSource);
const transactions = new DbTransactionService(dataSource, context);

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

const verifyReadAssignableRoles = async (): Promise<void> => {
  const workspaceId = await seedWorkspace();
  const warehouseId = await seedWarehouse(workspaceId);

  const managerRoleId = crypto.randomUUID();
  const customRoleAId = crypto.randomUUID();
  const customRoleBId = crypto.randomUUID();
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
      id: customRoleAId,
      warehouseId,
      name: 'Picker',
      kind: 'custom',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: customRoleBId,
      warehouseId,
      name: 'Receiver',
      kind: 'custom',
      createdAt: now,
      updatedAt: now,
    },
  ]);

  // A second Warehouse *of the same Workspace* with its own custom Role —
  // proves the read is narrowed to the named Warehouse, not the whole
  // Workspace.
  const siblingWarehouseId = await seedWarehouse(workspaceId);
  await dataSource.manager.getRepository(RoleEntity).insert({
    id: crypto.randomUUID(),
    warehouseId: siblingWarehouseId,
    name: 'Sibling Warehouse Role',
    kind: 'custom',
    createdAt: now,
    updatedAt: now,
  });

  // A Warehouse in a *different* Workspace, so a caller passing the
  // wrong `workspaceId` cannot be answered from a Warehouse that is not
  // theirs (AC-23a "no visibility into ... a Warehouse belonging to
  // another Workspace").
  const otherWorkspaceId = await seedWorkspace();

  const roles = await repository.readAssignableRoles(warehouseId, workspaceId);

  expect(roles).toHaveLength(2);
  expect(new Set(roles.map((role) => role.id))).toEqual(
    new Set([customRoleAId, customRoleBId]),
  );
  expect(new Set(roles.map((role) => role.name))).toEqual(
    new Set(['Picker', 'Receiver']),
  );
  // The projection itself is narrowed in SQL, not filtered afterwards —
  // no other Role column (e.g. `kind`, `warehouseId`) is present.
  for (const role of roles) {
    expect(Object.keys(role).sort()).toEqual(['id', 'name']);
  }

  // Asking with the *wrong* Workspace for a real Warehouse of another
  // Workspace discloses nothing.
  const roleForWrongWorkspace = await repository.readAssignableRoles(
    warehouseId,
    otherWorkspaceId,
  );
  expect(roleForWrongWorkspace).toEqual([]);
};

const verifyInsertMembershipWritesWorkspaceId = async (): Promise<void> => {
  const workspaceId = await seedWorkspace();
  const warehouseId = await seedWarehouse(workspaceId);
  const roleId = crypto.randomUUID();
  await dataSource.manager.getRepository(RoleEntity).insert({
    id: roleId,
    warehouseId,
    name: 'Picker',
    kind: 'custom',
    createdAt: now,
    updatedAt: now,
  });
  const targetUserId = crypto.randomUUID();
  await seedIdentity(
    targetUserId,
    workspaceId,
    `target.${targetUserId}@example.test`,
  );

  await repository.insertMembership({
    userId: targetUserId,
    warehouseId,
    workspaceId,
    roleId,
    roleKind: 'custom',
  });

  const membership = await dataSource.manager
    .getRepository(WarehouseMembershipEntity)
    .findOneBy({ userId: targetUserId, warehouseId });
  expect(membership).toMatchObject({ workspaceId, roleId });
};

const verifyInsertMembershipRejectsCrossWorkspacePair =
  async (): Promise<void> => {
    const userWorkspaceId = await seedWorkspace();
    const otherWorkspaceId = await seedWorkspace();
    const foreignWarehouseId = await seedWarehouse(otherWorkspaceId);
    const roleId = crypto.randomUUID();
    await dataSource.manager.getRepository(RoleEntity).insert({
      id: roleId,
      warehouseId: foreignWarehouseId,
      name: 'Picker',
      kind: 'custom',
      createdAt: now,
      updatedAt: now,
    });
    const targetUserId = crypto.randomUUID();
    await seedIdentity(
      targetUserId,
      userWorkspaceId,
      `target.${targetUserId}@example.test`,
    );

    // The User belongs to `userWorkspaceId`, the Warehouse belongs to
    // `otherWorkspaceId` — no single `workspace_id` value can satisfy both
    // composite foreign keys (`warehouse_memberships(user_id, workspace_id)
    // -> users(id, workspace_id)` and `warehouse_memberships(warehouse_id,
    // workspace_id) -> warehouses(id, workspace_id)`) at once, so the insert
    // must be rejected regardless of which `workspaceId` is supplied.
    await expect(
      repository.insertMembership({
        userId: targetUserId,
        warehouseId: foreignWarehouseId,
        workspaceId: userWorkspaceId,
        roleId,
        roleKind: 'custom',
      }),
    ).rejects.toThrow();

    const membership = await dataSource.manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy({ userId: targetUserId, warehouseId: foreignWarehouseId });
    expect(membership).toBeNull();
  };

const verifyDeleteMembershipNullsOnlyAffectedUser = async (): Promise<void> => {
  const workspaceId = await seedWorkspace();
  const warehouseId = await seedWarehouse(workspaceId);
  const roleId = crypto.randomUUID();
  await dataSource.manager.getRepository(RoleEntity).insert({
    id: roleId,
    warehouseId,
    name: 'Picker',
    kind: 'custom',
    createdAt: now,
    updatedAt: now,
  });

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  await seedIdentity(userAId, workspaceId, `a.${userAId}@example.test`);
  await seedIdentity(userBId, workspaceId, `b.${userBId}@example.test`);

  // Both Users hold a membership in the *same* Warehouse and both have it
  // as their stored Active Warehouse selection, so "no other" is a
  // meaningful assertion rather than a vacuous one.
  await dataSource.manager.getRepository(WarehouseMembershipEntity).insert([
    {
      userId: userAId,
      warehouseId,
      workspaceId,
      roleId,
      roleKind: 'custom',
      createdAt: now,
      updatedAt: now,
    },
    {
      userId: userBId,
      warehouseId,
      workspaceId,
      roleId,
      roleKind: 'custom',
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await dataSource.manager
    .getRepository(UserEntity)
    .update({ id: userAId }, { activeWarehouseId: warehouseId });
  await dataSource.manager
    .getRepository(UserEntity)
    .update({ id: userBId }, { activeWarehouseId: warehouseId });

  await repository.deleteMembership(userAId, warehouseId);

  const deletedMembership = await dataSource.manager
    .getRepository(WarehouseMembershipEntity)
    .findOneBy({ userId: userAId, warehouseId });
  expect(deletedMembership).toBeNull();

  const userA = await dataSource.manager
    .getRepository(UserEntity)
    .findOneBy({ id: userAId });
  expect(userA?.activeWarehouseId).toBeNull();

  // userB's own membership and selection are untouched.
  const survivingMembership = await dataSource.manager
    .getRepository(WarehouseMembershipEntity)
    .findOneBy({ userId: userBId, warehouseId });
  expect(survivingMembership).not.toBeNull();
  const userB = await dataSource.manager
    .getRepository(UserEntity)
    .findOneBy({ id: userBId });
  expect(userB?.activeWarehouseId).toBe(warehouseId);
};

const verifyLockRoleFindsRoleOfNamedWarehouse = async (): Promise<void> => {
  const workspaceId = await seedWorkspace();
  const warehouseId = await seedWarehouse(workspaceId);
  const roleId = crypto.randomUUID();
  await dataSource.manager.getRepository(RoleEntity).insert({
    id: roleId,
    warehouseId,
    name: 'Picker',
    kind: 'custom',
    createdAt: now,
    updatedAt: now,
  });

  const role = await transactions.executeInTransaction({}, () =>
    repository.lockRole(warehouseId, roleId),
  );

  expect(role).toMatchObject({ id: roleId, warehouseId, kind: 'custom' });
};

const verifyLockRoleReturnsNullForWrongWarehouse = async (): Promise<void> => {
  const workspaceId = await seedWorkspace();
  const warehouseId = await seedWarehouse(workspaceId);
  const otherWarehouseId = await seedWarehouse(workspaceId);
  const roleId = crypto.randomUUID();
  await dataSource.manager.getRepository(RoleEntity).insert({
    id: roleId,
    warehouseId,
    name: 'Picker',
    kind: 'custom',
    createdAt: now,
    updatedAt: now,
  });

  const role = await transactions.executeInTransaction({}, () =>
    repository.lockRole(otherWarehouseId, roleId),
  );

  expect(role).toBeNull();
};

const verifyLockRoleReturnsManagerRoleRatherThanFilteringIt =
  async (): Promise<void> => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const managerRoleId = crypto.randomUUID();
    await dataSource.manager.getRepository(RoleEntity).insert({
      id: managerRoleId,
      warehouseId,
      name: 'Warehouse Manager',
      kind: 'warehouse_manager',
      createdAt: now,
      updatedAt: now,
    });

    // Unlike `readAssignableRoles`, `lockRole` is kind-agnostic: it returns
    // the protected Warehouse Manager Role rather than hiding it, so a
    // caller can distinguish "reserved Role" from "missing/cross-Warehouse
    // Role" (AC-25).
    const role = await transactions.executeInTransaction({}, () =>
      repository.lockRole(warehouseId, managerRoleId),
    );

    expect(role).toMatchObject({
      id: managerRoleId,
      warehouseId,
      kind: 'warehouse_manager',
    });
  };

const verifyLockMembershipFindsMembershipByCompositeKey =
  async (): Promise<void> => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const roleId = crypto.randomUUID();
    await dataSource.manager.getRepository(RoleEntity).insert({
      id: roleId,
      warehouseId,
      name: 'Picker',
      kind: 'custom',
      createdAt: now,
      updatedAt: now,
    });
    const targetUserId = crypto.randomUUID();
    await seedIdentity(
      targetUserId,
      workspaceId,
      `target.${targetUserId}@example.test`,
    );
    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
      userId: targetUserId,
      warehouseId,
      workspaceId,
      roleId,
      roleKind: 'custom',
      createdAt: now,
      updatedAt: now,
    });

    const membership = await transactions.executeInTransaction({}, () =>
      repository.lockMembership(targetUserId, warehouseId),
    );

    expect(membership).toMatchObject({
      userId: targetUserId,
      warehouseId,
      workspaceId,
      roleId,
    });
  };

const verifyLockMembershipReturnsNullWhenNoRowExists =
  async (): Promise<void> => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const targetUserId = crypto.randomUUID();
    await seedIdentity(
      targetUserId,
      workspaceId,
      `target.${targetUserId}@example.test`,
    );

    const membership = await transactions.executeInTransaction({}, () =>
      repository.lockMembership(targetUserId, warehouseId),
    );

    expect(membership).toBeNull();
  };

describe('WarehouseMembershipAssignmentRepository', () => {
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

  describe('readAssignableRoles', () => {
    it(
      "returns only id and name, excludes the protected Warehouse Manager Role, and is constrained in SQL to the named Warehouse of the actor's own Workspace (AC-23a)",
      verifyReadAssignableRoles,
    );
  });

  describe('insertMembership', () => {
    it(
      'writes workspace_id on the created membership (AC-23)',
      verifyInsertMembershipWritesWorkspaceId,
    );

    it(
      'is rejected by the composite reference when the Warehouse belongs to a different Workspace than the User (AC-24)',
      verifyInsertMembershipRejectsCrossWorkspacePair,
    );
  });

  describe('deleteMembership', () => {
    it(
      "nulls the affected User's active_warehouse_id and no other User's (AC-25b)",
      verifyDeleteMembershipNullsOnlyAffectedUser,
    );
  });

  describe('lockRole', () => {
    it(
      'locks and returns the Role row for the named Warehouse',
      verifyLockRoleFindsRoleOfNamedWarehouse,
    );

    it(
      'returns null when the Role belongs to a different Warehouse',
      verifyLockRoleReturnsNullForWrongWarehouse,
    );

    it(
      'returns the protected Warehouse Manager Role rather than filtering it (AC-25)',
      verifyLockRoleReturnsManagerRoleRatherThanFilteringIt,
    );
  });

  describe('lockMembership', () => {
    it(
      'locks and returns the membership row for the composite (userId, warehouseId) key',
      verifyLockMembershipFindsMembershipByCompositeKey,
    );

    it(
      'returns null when no membership row exists for that pair',
      verifyLockMembershipReturnsNullWhenNoRowExists,
    );
  });
});
