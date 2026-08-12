import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';
import type { WorkspaceRoleEntityKind } from 'shared/domain/entities/workspace-role.entity';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
// `WorkspaceMembershipRepository` does not exist yet (T10) — this is the RED
// for AC-19b. The implementer creates it per
// docs/system/guides/creating-a-server-repository.md (data-model.md
// "Repository boundaries, transactions and locking"): add, remove and
// reassign a Workspace membership, plus the locking reads for the current
// Owner and the target.
import { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository';
import {
  buildWorkspace,
  buildWorkspaceRole,
} from 'test/factories/entity-factories';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-12T12:00:00.000Z');

// `WorkspaceMembershipRepository` is `error`-typed while its module does not
// exist yet, so every call below goes through this one cast rather than
// letting that `error` type leak into every assertion.
interface WorkspaceMembershipWrite {
  readonly userId: string;
  readonly workspaceId: string;
  readonly workspaceRoleId: string;
  readonly workspaceRoleKind: WorkspaceRoleEntityKind;
}
interface WorkspaceMembershipRepositoryContract {
  addMembership(input: WorkspaceMembershipWrite): Promise<void>;
  removeMembership(userId: string): Promise<void>;
  reassignMembership(
    userId: string,
    workspaceRoleId: string,
    workspaceRoleKind: WorkspaceRoleEntityKind,
  ): Promise<boolean>;
  lockOwnerMembership(
    workspaceId: string,
  ): Promise<WorkspaceMembershipEntity | null>;
  lockMembership(userId: string): Promise<WorkspaceMembershipEntity | null>;
}

const repository = new WorkspaceMembershipRepository(
  dataSource,
) as unknown as WorkspaceMembershipRepositoryContract;

// Installs the AsyncLocalStorage the repository's getEntityManager() reads
// from; no transaction is opened through it in this spec, so every call
// below falls through to dataSource.manager, exactly as a bare repository
// call outside a @Transactional() service does.
const context = new DbTransactionContext(dataSource);
const transactions = new DbTransactionService(dataSource, context);

const seedWorkspace = async (): Promise<string> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  return workspace.id as string;
};

const seedCustomRole = async (workspaceId: string): Promise<string> => {
  const role = buildWorkspaceRole({ workspaceId });
  await dataSource.manager.getRepository(WorkspaceRoleEntity).insert(role);
  return role.id as string;
};

const seedIdentity = async (
  userId: string,
  workspaceId: string,
  normalizedEmail: string,
): Promise<void> => {
  // `fk_users_workspace_id` is `DEFERRABLE INITIALLY DEFERRED` — the check
  // only fires at this transaction's own commit, so both inserts must land
  // inside the same transaction (see
  // member-lifecycle.repository.integration.spec.ts for the identical
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

describeIntegration('WorkspaceMembershipRepository', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE workspace_memberships, workspace_roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('addMembership / reassignMembership / removeMembership (AC-19b)', () => {
    it('leaves exactly one Workspace Role per Member across add, reassign and remove', async () => {
      const workspaceId = await seedWorkspace();
      const roleAId = await seedCustomRole(workspaceId);
      const roleBId = await seedCustomRole(workspaceId);

      const memberId = crypto.randomUUID();
      await seedIdentity(
        memberId,
        workspaceId,
        `member.${memberId}@example.test`,
      );

      await repository.addMembership({
        userId: memberId,
        workspaceId,
        workspaceRoleId: roleAId,
        workspaceRoleKind: 'custom',
      });

      const afterAdd = await dataSource.manager
        .getRepository(WorkspaceMembershipEntity)
        .findBy({ userId: memberId });
      expect(afterAdd).toHaveLength(1);
      expect(afterAdd[0]).toMatchObject({ workspaceRoleId: roleAId });

      const reassigned = await repository.reassignMembership(
        memberId,
        roleBId,
        'custom',
      );
      expect(reassigned).toBe(true);

      // AC-19b: the target holds *exactly* that one Role — no leftover row
      // under the previous Role, and no Warehouse membership involved.
      const afterReassign = await dataSource.manager
        .getRepository(WorkspaceMembershipEntity)
        .findBy({ userId: memberId });
      expect(afterReassign).toHaveLength(1);
      expect(afterReassign[0]).toMatchObject({ workspaceRoleId: roleBId });

      await repository.removeMembership(memberId);

      const afterRemove = await dataSource.manager
        .getRepository(WorkspaceMembershipEntity)
        .findBy({ userId: memberId });
      expect(afterRemove).toHaveLength(0);
    });

    it('does not reassign a Member of a different Workspace (cross-Workspace hiding)', async () => {
      const workspaceAId = await seedWorkspace();
      const workspaceBId = await seedWorkspace();
      const roleInB = await seedCustomRole(workspaceBId);

      const memberId = crypto.randomUUID();
      await seedIdentity(
        memberId,
        workspaceAId,
        `member.${memberId}@example.test`,
      );
      const roleInA = await seedCustomRole(workspaceAId);
      await repository.addMembership({
        userId: memberId,
        workspaceId: workspaceAId,
        workspaceRoleId: roleInA,
        workspaceRoleKind: 'custom',
      });

      // A Workspace Role id from a different Workspace must never attach —
      // exercised as a foreign-key violation at the persistence boundary
      // (uq_workspace_roles_id_workspace_kind), not silently accepted.
      await expect(
        repository.reassignMembership(memberId, roleInB, 'custom'),
      ).rejects.toThrow();

      const membership = await dataSource.manager
        .getRepository(WorkspaceMembershipEntity)
        .findOneBy({ userId: memberId });
      expect(membership).toMatchObject({ workspaceRoleId: roleInA });
    });
  });

  describe('lockOwnerMembership / lockMembership', () => {
    it('locks and returns the current Owner membership for the given Workspace', async () => {
      const workspaceId = await seedWorkspace();
      const ownerRole = buildWorkspaceRole({
        workspaceId,
        kind: 'workspace_owner',
        name: 'Workspace Owner',
      });
      await dataSource.manager
        .getRepository(WorkspaceRoleEntity)
        .insert(ownerRole);

      const ownerId = crypto.randomUUID();
      await seedIdentity(ownerId, workspaceId, `owner.${ownerId}@example.test`);
      await repository.addMembership({
        userId: ownerId,
        workspaceId,
        workspaceRoleId: ownerRole.id as string,
        workspaceRoleKind: 'workspace_owner',
      });

      const locked = await transactions.executeInTransaction({}, () =>
        repository.lockOwnerMembership(workspaceId),
      );
      expect(locked).toMatchObject({
        userId: ownerId,
        workspaceRoleKind: 'workspace_owner',
      });
    });

    it('returns null when no membership exists for the given user', async () => {
      const locked = await transactions.executeInTransaction({}, () =>
        repository.lockMembership('00000000-0000-4000-8000-000000000999'),
      );
      expect(locked).toBeNull();
    });
  });
});
