import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
// `WorkspaceOwnerTransferRepository` does not exist yet (T10) — this is the
// RED for AC-26. The implementer creates it per
// docs/system/guides/creating-a-server-repository.md (data-model.md
// "Repository boundaries, transactions and locking"): `.transfer` locks the
// `workspaces` row, then both membership rows in `user_id` order, rechecks
// their composite Role relations, and updates both assignments in one
// statement, exactly as `ManagerTransferRepository` does one level down.
import { WorkspaceOwnerTransferRepository } from 'shared/domain/repositories/workspace-owner-transfer.repository';
import {
  buildWorkspace,
  buildWorkspaceRole,
} from 'test/factories/entity-factories';

const now = new Date('2026-08-12T12:00:00.000Z');

// `WorkspaceOwnerTransferRepository` is `error`-typed while its module does
// not exist yet, so every call below goes through this one cast rather than
// letting that `error` type leak into every assertion.
interface WorkspaceOwnerTransferInput {
  readonly workspaceId: string;
  readonly currentOwnerUserId: string;
  readonly currentOwnerReplacementRoleId: string;
  readonly recipientUserId: string;
  readonly ownerRoleId: string;
}
interface WorkspaceOwnerTransferRepositoryContract {
  transfer(input: WorkspaceOwnerTransferInput): Promise<boolean>;
}

const repository = new WorkspaceOwnerTransferRepository(
  dataSource,
) as unknown as WorkspaceOwnerTransferRepositoryContract;

// Installs the AsyncLocalStorage the repository's getEntityManager() reads
// from; single-connection calls below fall through to dataSource.manager,
// exactly as a bare repository call outside a @Transactional() service does.
// The concurrency tests below run repository calls against explicit
// QueryRunner-owned managers through `context.run(...)` instead.
const context = new DbTransactionContext(dataSource);
const transactions = new DbTransactionService(dataSource, context);

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

interface OwnershipGraph {
  readonly workspaceId: string;
  readonly ownerRoleId: string;
  readonly ownerUserId: string;
  readonly replacementRoleId: string;
  readonly candidateBId: string;
  readonly candidateBRoleId: string;
  readonly candidateCId: string;
  readonly candidateCRoleId: string;
}

// One Workspace with a current Owner, a spare custom Role for the outgoing
// Owner to land in, and two other Workspace Members (each already holding
// their own custom Role) as transfer-recipient candidates.
const seedOwnershipGraph = async (): Promise<OwnershipGraph> => {
  const workspaceId = await seedWorkspace();
  const ownerRole = buildWorkspaceRole({
    workspaceId,
    kind: 'workspace_owner',
    name: 'Workspace Owner',
  });
  const replacementRole = buildWorkspaceRole({ workspaceId });
  const candidateBRole = buildWorkspaceRole({ workspaceId });
  const candidateCRole = buildWorkspaceRole({ workspaceId });
  await dataSource.manager
    .getRepository(WorkspaceRoleEntity)
    .insert([ownerRole, replacementRole, candidateBRole, candidateCRole]);

  const ownerUserId = crypto.randomUUID();
  const candidateBId = crypto.randomUUID();
  const candidateCId = crypto.randomUUID();
  await seedIdentity(
    ownerUserId,
    workspaceId,
    `owner.${ownerUserId}@example.test`,
  );
  await seedIdentity(
    candidateBId,
    workspaceId,
    `candidate-b.${candidateBId}@example.test`,
  );
  await seedIdentity(
    candidateCId,
    workspaceId,
    `candidate-c.${candidateCId}@example.test`,
  );

  await dataSource.manager.getRepository(WorkspaceMembershipEntity).insert([
    {
      userId: ownerUserId,
      workspaceId,
      workspaceRoleId: ownerRole.id,
      workspaceRoleKind: 'workspace_owner',
      createdAt: now,
      updatedAt: now,
    },
    {
      userId: candidateBId,
      workspaceId,
      workspaceRoleId: candidateBRole.id,
      workspaceRoleKind: 'custom',
      createdAt: now,
      updatedAt: now,
    },
    {
      userId: candidateCId,
      workspaceId,
      workspaceRoleId: candidateCRole.id,
      workspaceRoleKind: 'custom',
      createdAt: now,
      updatedAt: now,
    },
  ]);

  return {
    workspaceId,
    ownerRoleId: ownerRole.id as string,
    ownerUserId,
    replacementRoleId: replacementRole.id as string,
    candidateBId,
    candidateBRoleId: candidateBRole.id as string,
    candidateCId,
    candidateCRoleId: candidateCRole.id as string,
  };
};

const ownerCount = async (workspaceId: string): Promise<number> =>
  dataSource.manager.getRepository(WorkspaceMembershipEntity).countBy({
    workspaceId,
    workspaceRoleKind: 'workspace_owner',
  });

const registerHappyTransferTest = (): void => {
  it('promotes the recipient to sole Owner and reassigns the former Owner to the selected custom Role as one outcome (AC-26)', async () => {
    const graph = await seedOwnershipGraph();

    const transferred = await transactions.executeInTransaction({}, () =>
      repository.transfer({
        workspaceId: graph.workspaceId,
        currentOwnerUserId: graph.ownerUserId,
        currentOwnerReplacementRoleId: graph.replacementRoleId,
        recipientUserId: graph.candidateBId,
        ownerRoleId: graph.ownerRoleId,
      }),
    );

    expect(transferred).toBe(true);

    const recipientMembership = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: graph.candidateBId });
    expect(recipientMembership).toMatchObject({
      workspaceRoleId: graph.ownerRoleId,
      workspaceRoleKind: 'workspace_owner',
    });

    const formerOwnerMembership = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: graph.ownerUserId });
    expect(formerOwnerMembership).toMatchObject({
      workspaceRoleId: graph.replacementRoleId,
      workspaceRoleKind: 'custom',
    });

    // Every other Workspace Member's Role is untouched by the transfer.
    const untouchedMembership = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: graph.candidateCId });
    expect(untouchedMembership).toMatchObject({
      workspaceRoleId: graph.candidateCRoleId,
    });

    expect(await ownerCount(graph.workspaceId)).toBe(1);
  });

  // RED for T62/AC-26 (review S1-13) — `uq_workspace_memberships_one_owner`
  // is a partial unique *index*, which PostgreSQL checks per row and cannot
  // be deferred. A single `UPDATE ... CASE` over both rows leaves their
  // update order to the planner, so whenever the recipient's row is written
  // before the outgoing Owner's is demoted, two rows momentarily claim the
  // Owner slot and the index raises a duplicate key — a 500 for a legal
  // transfer.
  //
  // The order the planner picks follows the scan, so seeding the recipient's
  // membership row physically first reproduces it deterministically. The
  // Warehouse level avoids this by writing two ordered statements
  // (`manager-transfer.repository.ts`), which is what this asserts.
  it('AC-26: completes when the recipient membership row is scanned before the outgoing Owner row (the sole-Owner index is checked per row, not deferred)', async () => {
    const workspaceId = await seedWorkspace();
    const ownerRole = buildWorkspaceRole({
      workspaceId,
      kind: 'workspace_owner',
      name: 'Workspace Owner',
    });
    const replacementRole = buildWorkspaceRole({ workspaceId });
    const recipientRole = buildWorkspaceRole({ workspaceId });
    await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .insert([ownerRole, replacementRole, recipientRole]);

    const ownerUserId = crypto.randomUUID();
    const recipientUserId = crypto.randomUUID();
    await seedIdentity(
      ownerUserId,
      workspaceId,
      `owner.${ownerUserId}@example.test`,
    );
    await seedIdentity(
      recipientUserId,
      workspaceId,
      `recipient.${recipientUserId}@example.test`,
    );

    // The recipient's row first, so the seq scan reaches it before the
    // Owner's — the order a single CASE statement cannot survive.
    await dataSource.manager.getRepository(WorkspaceMembershipEntity).insert({
      userId: recipientUserId,
      workspaceId,
      workspaceRoleId: recipientRole.id,
      workspaceRoleKind: 'custom',
      createdAt: now,
      updatedAt: now,
    });
    await dataSource.manager.getRepository(WorkspaceMembershipEntity).insert({
      userId: ownerUserId,
      workspaceId,
      workspaceRoleId: ownerRole.id,
      workspaceRoleKind: 'workspace_owner',
      createdAt: now,
      updatedAt: now,
    });

    const transferred = await transactions.executeInTransaction({}, () =>
      repository.transfer({
        workspaceId,
        currentOwnerUserId: ownerUserId,
        currentOwnerReplacementRoleId: replacementRole.id as string,
        recipientUserId,
        ownerRoleId: ownerRole.id as string,
      }),
    );

    expect(transferred).toBe(true);
    expect(await ownerCount(workspaceId)).toBe(1);
    expect(
      await dataSource.manager
        .getRepository(WorkspaceMembershipEntity)
        .findOneBy({ userId: recipientUserId }),
    ).toMatchObject({ workspaceRoleKind: 'workspace_owner' });
    expect(
      await dataSource.manager
        .getRepository(WorkspaceMembershipEntity)
        .findOneBy({ userId: ownerUserId }),
    ).toMatchObject({
      workspaceRoleId: replacementRole.id,
      workspaceRoleKind: 'custom',
    });
  });
};

const registerStalePreconditionTest = (): void => {
  it('rejects a stale current-Owner precondition rather than creating a second Owner', async () => {
    const graph = await seedOwnershipGraph();

    // candidateB is already Owner after a first transfer; a second attempt
    // that still claims the original owner is the current Owner must not
    // silently promote candidateC too.
    const first = await transactions.executeInTransaction({}, () =>
      repository.transfer({
        workspaceId: graph.workspaceId,
        currentOwnerUserId: graph.ownerUserId,
        currentOwnerReplacementRoleId: graph.replacementRoleId,
        recipientUserId: graph.candidateBId,
        ownerRoleId: graph.ownerRoleId,
      }),
    );
    expect(first).toBe(true);

    const second = await transactions.executeInTransaction({}, () =>
      repository.transfer({
        workspaceId: graph.workspaceId,
        currentOwnerUserId: graph.ownerUserId,
        currentOwnerReplacementRoleId: graph.candidateCRoleId,
        recipientUserId: graph.candidateCId,
        ownerRoleId: graph.ownerRoleId,
      }),
    );
    expect(second).toBe(false);

    expect(await ownerCount(graph.workspaceId)).toBe(1);
    const recipientMembership = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: graph.candidateBId });
    expect(recipientMembership).toMatchObject({
      workspaceRoleKind: 'workspace_owner',
    });
  });
};

describe('WorkspaceOwnerTransferRepository', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE workspace_memberships, workspace_roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  }, 20_000);

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('transfer', () => {
    registerHappyTransferTest();
    registerStalePreconditionTest();
  });
});
