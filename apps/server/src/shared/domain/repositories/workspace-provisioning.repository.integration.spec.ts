import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';
import { WorkspacePermissionEntity } from 'shared/domain/entities/workspace-permission.entity';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity';
import type { WorkspaceProvisioningInput } from 'shared/domain/repositories/workspace-provisioning.repository';
// `WorkspaceProvisioningRepository` does not exist yet (T12): this import is
// the RED for AC-01 — the implementer creates it per
// `docs/system/guides/creating-a-server-repository.md`, mirroring
// `AccessProvisioningRepository`'s shape.
import { WorkspaceProvisioningRepository } from 'shared/domain/repositories/workspace-provisioning.repository';
import {
  buildWorkspace,
  buildWorkspacePermission,
} from 'test/factories/entity-factories';
import type { EntityManager } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const now = new Date('2026-08-12T12:00:00.000Z');

// A synthetic, catalogue-shaped id that never collides with a real seeded
// Workspace Permission (mirrors `buildWorkspacePermission`'s own generator).
const missingWorkspacePermissionId = (): string =>
  `WORKSPACE_PERMISSIONS_FIXTURE:MISSING${crypto.randomUUID().replace(/-/gu, '').toUpperCase()}`;

// `fk_users_workspace_id` is `DEFERRABLE INITIALLY DEFERRED`, matching the
// `accounts.user_id` / `users.account_id` deferred pair (data-model.md
// "users (changed)"): the check only fires at the COMMIT of the transaction
// the insert runs in. The registrant User must reference a Workspace that
// `provisionWorkspace` itself creates, so this helper never opens its own
// transaction — it writes through the manager a caller already has open
// (see each `it` below), and the deferred check resolves once
// `provisionWorkspace` has inserted that Workspace row in the same
// transaction, matching registration bootstrap's real one-transaction shape
// (sad.md §6.1).
const seedIdentity = async (
  manager: EntityManager,
  userId: string,
  workspaceId: string,
): Promise<void> => {
  await manager.getRepository(AccountEntity).insert({
    id: userId,
    userId,
    normalizedEmail: `registrant.${userId}@example.test`,
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
};

const buildProvisioningInput = (
  overrides: Partial<WorkspaceProvisioningInput> = {},
): WorkspaceProvisioningInput => {
  const workspace = buildWorkspace();
  const ownerRoleId = crypto.randomUUID();
  const registrantUserId = crypto.randomUUID();
  const permission = buildWorkspacePermission();

  return {
    workspace: {
      id: workspace.id as string,
      name: workspace.name as string | null,
    },
    ownerRole: {
      id: ownerRoleId,
      workspaceId: workspace.id as string,
      name: 'Workspace Owner',
      kind: 'workspace_owner',
    },
    ownerMembership: {
      userId: registrantUserId,
      workspaceId: workspace.id as string,
      workspaceRoleId: ownerRoleId,
      workspaceRoleKind: 'workspace_owner',
    },
    permissionIds: [permission.id as string],
    ...overrides,
  };
};

describe('WorkspaceProvisioningRepository', () => {
  const repository = new WorkspaceProvisioningRepository(dataSource);
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, workspace_role_permissions, workspace_memberships, workspace_roles, workspace_permissions, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('provisionWorkspace', () => {
    it('writes the Workspace, its protected Owner Role, the Role catalogue grants and the registrant Workspace membership as one outcome (AC-01)', async () => {
      const input = buildProvisioningInput();
      await dataSource.manager.getRepository(WorkspacePermissionEntity).insert({
        id: input.permissionIds[0],
        label: 'Synthetic Owner grant fixture',
        kind: 'assignable',
        createdAt: now,
        updatedAt: now,
      });

      // `seedIdentity` and `provisionWorkspace` share one transaction (via
      // `DbTransactionService`, the shared context `provisionWorkspace`'s
      // `getEntityManager(this.dataSource)` observes) so the registrant
      // User's deferred `workspace_id` FK resolves once `provisionWorkspace`
      // has created that same Workspace, before the shared commit.
      await transactions.executeInTransaction({}, async (manager) => {
        await seedIdentity(
          manager,
          input.ownerMembership.userId,
          input.workspace.id,
        );
        await repository.provisionWorkspace(input);
      });

      const workspace = await dataSource.manager
        .getRepository(WorkspaceEntity)
        .findOneBy({ id: input.workspace.id });
      expect(workspace).toMatchObject({
        id: input.workspace.id,
        name: input.workspace.name,
      });

      const ownerRole = await dataSource.manager
        .getRepository(WorkspaceRoleEntity)
        .findOneBy({ id: input.ownerRole.id });
      expect(ownerRole).toMatchObject({
        id: input.ownerRole.id,
        workspaceId: input.workspace.id,
        kind: 'workspace_owner',
      });

      const grant = await dataSource.manager
        .getRepository(WorkspaceRolePermissionEntity)
        .findOneBy({
          workspaceRoleId: input.ownerRole.id,
          workspacePermissionId: input.permissionIds[0],
        });
      expect(grant).toMatchObject({
        workspaceRoleId: input.ownerRole.id,
        workspacePermissionId: input.permissionIds[0],
        workspaceRoleKind: 'workspace_owner',
      });

      const membership = await dataSource.manager
        .getRepository(WorkspaceMembershipEntity)
        .findOneBy({ userId: input.ownerMembership.userId });
      expect(membership).toMatchObject({
        userId: input.ownerMembership.userId,
        workspaceId: input.workspace.id,
        workspaceRoleId: input.ownerRole.id,
        workspaceRoleKind: 'workspace_owner',
      });
    });

    it("joins the caller's transaction, so a later failure in the same transaction rolls the whole outcome back (AC-01/AC-02)", async () => {
      const input = buildProvisioningInput();
      await dataSource.manager.getRepository(WorkspacePermissionEntity).insert({
        id: input.permissionIds[0],
        label: 'Synthetic Owner grant fixture',
        kind: 'assignable',
        createdAt: now,
        updatedAt: now,
      });
      await expect(
        transactions.executeInTransaction({}, async (manager) => {
          await seedIdentity(
            manager,
            input.ownerMembership.userId,
            input.workspace.id,
          );
          await repository.provisionWorkspace(input);
          // Forces the outer transaction to roll back after
          // `provisionWorkspace` has run its inserts, proving it joined the
          // ambient transaction rather than committing independently. Uses
          // the same ambient `manager` (not `dataSource.manager`, which
          // would open a second connection and deadlock against the still-open
          // outer transaction's uncommitted `id` lock).
          await manager
            .getRepository(WorkspaceEntity)
            .insert({ ...input.workspace, id: input.workspace.id });
        }),
      ).rejects.toThrow();

      const workspace = await dataSource.manager
        .getRepository(WorkspaceEntity)
        .findOneBy({ id: input.workspace.id });
      expect(workspace).toBeNull();
    });

    it('fails when a required Workspace Permission identifier is absent from the catalogue', async () => {
      const input = buildProvisioningInput({
        permissionIds: [missingWorkspacePermissionId()],
      });

      await expect(
        transactions.executeInTransaction({}, async (manager) => {
          await seedIdentity(
            manager,
            input.ownerMembership.userId,
            input.workspace.id,
          );
          await repository.provisionWorkspace(input);
        }),
      ).rejects.toThrow();

      const workspace = await dataSource.manager
        .getRepository(WorkspaceEntity)
        .findOneBy({ id: input.workspace.id });
      expect(workspace).toBeNull();
    });
  });
});
