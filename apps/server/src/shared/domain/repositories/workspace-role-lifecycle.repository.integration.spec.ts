import dataSource from 'shared/database/data-source.js';
import { DbTransactionService } from 'shared/database/db-transaction.service.js';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service.js';
import { AccountEntity } from 'shared/domain/entities/account.entity.js';
import { UserEntity } from 'shared/domain/entities/user.entity.js';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity.js';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity.js';
import { WorkspacePermissionEntity } from 'shared/domain/entities/workspace-permission.entity.js';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity.js';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity.js';
// `WorkspaceRoleLifecycleRepository` does not exist yet (T10) — this is the
// RED for AC-17/AC-17a. The implementer creates it per
// docs/system/guides/creating-a-server-repository.md, mirroring
// `RoleLifecycleRepository` one level up (data-model.md "Repository
// boundaries, transactions and locking"): scoped custom Role create/
// update/delete, Permission-membership replacement (including the empty
// set), and the atomic assigned-Role replacement (`UPDATE
// workspace_memberships SET workspace_role_id = $replacement` then `DELETE
// FROM workspace_roles`), using `idx_workspace_memberships_role_id`.
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository.js';
import {
  buildWorkspace,
  buildWorkspaceMembership,
  buildWorkspacePermission,
  buildWorkspaceRole,
} from 'test/factories/entity-factories.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const now = new Date('2026-08-12T12:00:00.000Z');

// The shape this RED step expects the implementer to expose
// (data-model.md "Repository boundaries", mirroring `RoleLifecycleRepository`
// one level up). `WorkspaceRoleLifecycleRepository` is `error`-typed while its
// module does not exist yet, so every call below goes through this one cast
// rather than letting that `error` type leak into every assertion.
interface WorkspaceCustomRoleWrite {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
}
interface WorkspaceRoleLifecycleRepositoryContract {
  createCustomRole(
    input: WorkspaceCustomRoleWrite,
    permissions: readonly WorkspacePermissionEntity[],
  ): Promise<void>;
  findRoleByName(
    workspaceId: string,
    name: string,
  ): Promise<WorkspaceRoleEntity | null>;
  findCustomRole(
    workspaceId: string,
    roleId: string,
  ): Promise<WorkspaceRoleEntity | null>;
  updateCustomRole(roleId: string, name: string): Promise<void>;
  replaceCustomRolePermissions(
    roleId: string,
    permissions: readonly WorkspacePermissionEntity[],
  ): Promise<void>;
  countRoleMembers(workspaceId: string, roleId: string): Promise<number>;
  replaceRoleAssignments(
    workspaceId: string,
    sourceRoleId: string,
    replacementRoleId: string,
  ): Promise<void>;
  removeCustomRole(workspaceId: string, roleId: string): Promise<void>;
  lockWorkspace(workspaceId: string): Promise<WorkspaceEntity | null>;
}

const repository = new WorkspaceRoleLifecycleRepository(
  dataSource,
) as unknown as WorkspaceRoleLifecycleRepositoryContract;

// `dataSource.manager` is the fallback `getEntityManager()` reads outside an
// active transaction; installing the context is enough for the plain
// (non-transactional) calls in this spec, exactly as
// `workspace-read.repository.integration.spec.ts` does.
const context = new DbTransactionContext(dataSource);
const transactions = new DbTransactionService(dataSource, context);

const seedIdentity = async (
  userId: string,
  workspaceId: string,
  normalizedEmail: string,
): Promise<void> => {
  // `fk_users_workspace_id` is `DEFERRABLE INITIALLY DEFERRED` — the Workspace
  // referenced must already exist, and the check only fires at this
  // transaction's own commit, so both inserts land inside one transaction
  // (see member-lifecycle.repository.integration.spec.ts for the identical
  // pattern).
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

const seedWorkspace = async (): Promise<string> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  return workspace.id as string;
};

const registerCreateUpdateRemoveTests = (): void => {
  describe('createCustomRole / updateCustomRole / removeCustomRole', () => {
    it('scopes every write to the given Workspace and leaves a same-named Role in another Workspace untouched', async () => {
      const workspaceAId = await seedWorkspace();
      const workspaceBId = await seedWorkspace();

      const roleAId = crypto.randomUUID();
      const roleBId = crypto.randomUUID();
      await repository.createCustomRole(
        { id: roleAId, workspaceId: workspaceAId, name: 'Inventory Lead' },
        [],
      );
      await repository.createCustomRole(
        { id: roleBId, workspaceId: workspaceBId, name: 'Inventory Lead' },
        [],
      );

      await repository.updateCustomRole(roleAId, 'Inventory Lead (renamed)');

      const roleA = await dataSource.manager
        .getRepository(WorkspaceRoleEntity)
        .findOneBy({ id: roleAId });
      const roleB = await dataSource.manager
        .getRepository(WorkspaceRoleEntity)
        .findOneBy({ id: roleBId });
      expect(roleA).toMatchObject({
        workspaceId: workspaceAId,
        name: 'Inventory Lead (renamed)',
      });
      expect(roleB).toMatchObject({
        workspaceId: workspaceBId,
        name: 'Inventory Lead',
      });

      // Deleting scoped by the *wrong* Workspace must not remove the row —
      // the same cross-Workspace hiding `RoleLifecycleRepository` enforces.
      await repository.removeCustomRole(workspaceBId, roleAId);
      const roleAStillThere = await dataSource.manager
        .getRepository(WorkspaceRoleEntity)
        .findOneBy({ id: roleAId });
      expect(roleAStillThere).not.toBeNull();

      await repository.removeCustomRole(workspaceAId, roleAId);
      const roleAGone = await dataSource.manager
        .getRepository(WorkspaceRoleEntity)
        .findOneBy({ id: roleAId });
      expect(roleAGone).toBeNull();
    });
  });
};

const registerReplacePermissionsTests = (): void => {
  describe('replaceCustomRolePermissions', () => {
    it('replaces Permission membership, including replacement with the empty set', async () => {
      const workspaceId = await seedWorkspace();
      const roleId = crypto.randomUUID();
      await repository.createCustomRole(
        { id: roleId, workspaceId, name: 'Custom Workspace Role' },
        [],
      );

      const permissionOne = buildWorkspacePermission();
      const permissionTwo = buildWorkspacePermission();
      await dataSource.manager
        .getRepository(WorkspacePermissionEntity)
        .insert([permissionOne, permissionTwo]);

      await repository.replaceCustomRolePermissions(roleId, [
        permissionOne,
        permissionTwo,
      ] as WorkspacePermissionEntity[]);

      const grantsAfterFirstReplace = await dataSource.manager
        .getRepository(WorkspaceRolePermissionEntity)
        .findBy({ workspaceRoleId: roleId });
      expect(grantsAfterFirstReplace).toHaveLength(2);

      // The explicitly required edge: replacement with the empty set leaves
      // no grant rows for this Role.
      await repository.replaceCustomRolePermissions(roleId, []);

      const grantsAfterEmptyReplace = await dataSource.manager
        .getRepository(WorkspaceRolePermissionEntity)
        .findBy({ workspaceRoleId: roleId });
      expect(grantsAfterEmptyReplace).toHaveLength(0);
    });
  });
};

const registerReplaceRoleAssignmentsHappyTest = (): void => {
  it('moves every affected membership to the replacement and deletes the source Role as one outcome, leaving an unrelated membership untouched', async () => {
    const workspaceId = await seedWorkspace();

    const sourceRoleId = crypto.randomUUID();
    const replacementRoleId = crypto.randomUUID();
    const unrelatedRoleId = crypto.randomUUID();
    await dataSource.manager.getRepository(WorkspaceRoleEntity).insert([
      buildWorkspaceRole({
        id: sourceRoleId,
        workspaceId,
        name: 'Deleted custom Workspace Role',
      }),
      buildWorkspaceRole({
        id: replacementRoleId,
        workspaceId,
        name: 'Replacement custom Workspace Role',
      }),
      buildWorkspaceRole({
        id: unrelatedRoleId,
        workspaceId,
        name: 'Unrelated custom Workspace Role',
      }),
    ]);

    const memberOneId = crypto.randomUUID();
    const memberTwoId = crypto.randomUUID();
    const unrelatedMemberId = crypto.randomUUID();
    await seedIdentity(
      memberOneId,
      workspaceId,
      `member-one.${memberOneId}@example.test`,
    );
    await seedIdentity(
      memberTwoId,
      workspaceId,
      `member-two.${memberTwoId}@example.test`,
    );
    await seedIdentity(
      unrelatedMemberId,
      workspaceId,
      `unrelated.${unrelatedMemberId}@example.test`,
    );

    await dataSource.manager.getRepository(WorkspaceMembershipEntity).insert([
      buildWorkspaceMembership({
        userId: memberOneId,
        workspaceId,
        workspaceRoleId: sourceRoleId,
      }),
      buildWorkspaceMembership({
        userId: memberTwoId,
        workspaceId,
        workspaceRoleId: sourceRoleId,
      }),
      buildWorkspaceMembership({
        userId: unrelatedMemberId,
        workspaceId,
        workspaceRoleId: unrelatedRoleId,
      }),
    ] as WorkspaceMembershipEntity[]);

    await transactions.executeInTransaction({}, async () => {
      await repository.replaceRoleAssignments(
        workspaceId,
        sourceRoleId,
        replacementRoleId,
      );
      await repository.removeCustomRole(workspaceId, sourceRoleId);
    });

    const memberOneMembership = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: memberOneId });
    const memberTwoMembership = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: memberTwoId });
    const unrelatedMembership = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: unrelatedMemberId });
    expect(memberOneMembership).toMatchObject({
      workspaceRoleId: replacementRoleId,
    });
    expect(memberTwoMembership).toMatchObject({
      workspaceRoleId: replacementRoleId,
    });
    expect(unrelatedMembership).toMatchObject({
      workspaceRoleId: unrelatedRoleId,
    });

    const sourceRole = await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .findOneBy({ id: sourceRoleId });
    expect(sourceRole).toBeNull();
  });
};

const registerReplaceRoleAssignmentsRollbackTest = (): void => {
  it('leaves nothing behind when the transaction owning the replacement is rolled back after an injected failure', async () => {
    const workspaceId = await seedWorkspace();

    const sourceRoleId = crypto.randomUUID();
    const replacementRoleId = crypto.randomUUID();
    await dataSource.manager.getRepository(WorkspaceRoleEntity).insert([
      buildWorkspaceRole({
        id: sourceRoleId,
        workspaceId,
        name: 'Deleted custom Workspace Role',
      }),
      buildWorkspaceRole({
        id: replacementRoleId,
        workspaceId,
        name: 'Replacement custom Workspace Role',
      }),
    ]);

    const memberId = crypto.randomUUID();
    await seedIdentity(
      memberId,
      workspaceId,
      `member.${memberId}@example.test`,
    );
    await dataSource.manager.getRepository(WorkspaceMembershipEntity).insert(
      buildWorkspaceMembership({
        userId: memberId,
        workspaceId,
        workspaceRoleId: sourceRoleId,
      }),
    );

    await expect(
      transactions.executeInTransaction({}, async (manager) => {
        await repository.replaceRoleAssignments(
          workspaceId,
          sourceRoleId,
          replacementRoleId,
        );
        await repository.removeCustomRole(workspaceId, sourceRoleId);
        // Inject a failure inside the *same* transaction: a duplicate
        // primary key insert is refused by PostgreSQL itself, forcing a
        // rollback of every statement this transaction issued, including
        // the two above.
        await manager.getRepository(WorkspaceRoleEntity).insert(
          buildWorkspaceRole({
            id: replacementRoleId,
            workspaceId,
            name: 'Duplicate id — forces the injected failure',
          }),
        );
      }),
    ).rejects.toThrow();

    const membership = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: memberId });
    const sourceRole = await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .findOneBy({ id: sourceRoleId });
    expect(membership).toMatchObject({ workspaceRoleId: sourceRoleId });
    expect(sourceRole).not.toBeNull();
  });
};

describe('WorkspaceRoleLifecycleRepository', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE workspace_memberships, workspace_role_permissions, workspace_roles, workspace_permissions, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  registerCreateUpdateRemoveTests();
  registerReplacePermissionsTests();

  describe('replaceRoleAssignments + removeCustomRole (AC-17)', () => {
    registerReplaceRoleAssignmentsHappyTest();
    registerReplaceRoleAssignmentsRollbackTest();
  });
});
