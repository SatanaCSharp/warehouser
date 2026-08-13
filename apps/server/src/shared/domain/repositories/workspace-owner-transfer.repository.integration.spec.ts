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
import type { QueryRunner } from 'typeorm';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

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

// ---------------------------------------------------------------------
// Small helpers for the two genuine-concurrency tests below. Both open two
// independent PostgreSQL connections (two QueryRunners) and interleave them
// deliberately by polling real server-side wait state
// (`pg_stat_activity`) instead of a fixed sleep, so the interleaving point
// is observed rather than guessed.
// ---------------------------------------------------------------------

const backendPid = async (runner: QueryRunner): Promise<number> => {
  const rows = await runner.query('SELECT pg_backend_pid() AS pid');
  return Number(rows[0].pid);
};

// A single-row `SELECT ... FOR UPDATE` waiter blocks on the holding
// transaction's xid (`pg_locks.locktype = 'transactionid'`), which is not
// tied to any relation — so the contended table cannot be read off
// `pg_locks` at all here. `pg_stat_activity.query` for the *blocked*
// backend itself is simpler and unambiguous instead: while a backend is
// stuck waiting, that column holds the exact statement it is stuck on, so
// reading the table name out of that statement identifies what it is
// blocked on directly, with no locktype/relation-id guessing.
const blockedOnRelation = async (pid: number): Promise<string | null> => {
  const rows = await dataSource.query(
    `SELECT query
       FROM pg_stat_activity
      WHERE pid = $1 AND wait_event_type = 'Lock'`,
    [pid],
  );
  const query = rows[0]?.query as string | undefined;
  if (!query) {
    return null;
  }
  const match = /FROM\s+"(?<table>\w+)"/u.exec(query);
  return match?.groups?.table ?? null;
};

const waitForEitherBlocked = async (
  pidA: number,
  pidB: number,
): Promise<{ blockedPid: number; relation: string }> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const relationA = await blockedOnRelation(pidA);
    if (relationA) {
      return { blockedPid: pidA, relation: relationA };
    }
    const relationB = await blockedOnRelation(pidB);
    if (relationB) {
      return { blockedPid: pidB, relation: relationB };
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(
    'Neither concurrent transfer backend entered a blocked wait state within the poll budget',
  );
};

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

const registerLockOrderTest = (): void => {
  it('locks the `workspaces` row before either Workspace membership row: a competing transfer on the same Workspace blocks on `workspaces`, not on `workspace_memberships` (lock order, no cycle with a Warehouse-level command)', async () => {
    const graph = await seedOwnershipGraph();
    // Polls real Postgres wait state to observe genuine concurrency instead
    // of guessing timing; give it more room than Jest's 5s default.

    const runner1 = dataSource.createQueryRunner();
    await runner1.connect();
    const runner2 = dataSource.createQueryRunner();
    await runner2.connect();
    await runner1.startTransaction();
    await runner2.startTransaction();

    const pid1 = await backendPid(runner1);
    const pid2 = await backendPid(runner2);

    // Both attempt to transfer the *same* current Owner, to two different
    // recipients, so both transactions necessarily contend for the same
    // Workspace and the same current-Owner membership row. Fired without
    // awaiting so they race for real, over two separate connections.
    const call1 = context.run(runner1.manager, () =>
      repository.transfer({
        workspaceId: graph.workspaceId,
        currentOwnerUserId: graph.ownerUserId,
        currentOwnerReplacementRoleId: graph.replacementRoleId,
        recipientUserId: graph.candidateBId,
        ownerRoleId: graph.ownerRoleId,
      }),
    );
    const call2 = context.run(runner2.manager, () =>
      repository.transfer({
        workspaceId: graph.workspaceId,
        currentOwnerUserId: graph.ownerUserId,
        currentOwnerReplacementRoleId: graph.candidateCRoleId,
        recipientUserId: graph.candidateCId,
        ownerRoleId: graph.ownerRoleId,
      }),
    );
    call1.catch(() => undefined);
    call2.catch(() => undefined);

    const { blockedPid, relation } = await waitForEitherBlocked(pid1, pid2);

    // The whole point of the fixed lock order: whichever side loses the
    // race blocks on the *Workspace* row, never on `workspace_memberships` —
    // if it blocked there instead, the membership rows would have been
    // locked before the Workspace row, which is the ordering data-model.md
    // "Repository boundaries" and this task explicitly forbid.
    expect(relation).toBe('workspaces');

    const [winner, loser] =
      blockedPid === pid1 ? [runner2, runner1] : [runner1, runner2];

    await winner.commitTransaction();
    await winner.release();

    // The loser's call unblocks once the winner commits; its outcome is not
    // this test's concern (covered by the recheck/constraint tests above and
    // below) — only that it was blocked on the right relation while waiting.
    await Promise.allSettled([call1, call2]);
    await loser.rollbackTransaction().catch(() => undefined);
    await loser.release();
  }, 20_000);
};

const registerConstraintIsFinalArbiterTest = (): void => {
  it('lets the database uq_workspace_memberships_one_owner constraint be the final arbiter when two genuinely concurrent writers race for the Owner slot underneath the repository lock, preserving exactly one Owner', async () => {
    const graph = await seedOwnershipGraph();

    // This exercises the persistence-layer invariant `transfer` itself
    // relies on as its backstop (data-model.md: "Database constraints are
    // the final arbiter under concurrency"), by writing directly against
    // `workspace_memberships` from two independent connections rather than
    // through `transfer` — `transfer`'s own Workspace-row lock (proven
    // above) already serializes *its own* callers before they can reach
    // this constraint, so reaching the constraint itself requires bypassing
    // that lock, exactly as a defense-in-depth backstop is meant to be
    // reached: by something that did not take the intended lock.
    const runner1 = dataSource.createQueryRunner();
    await runner1.connect();
    const runner2 = dataSource.createQueryRunner();
    await runner2.connect();
    await runner1.startTransaction();
    await runner2.startTransaction();

    const pid2 = await backendPid(runner2);

    // txn1: vacate the current Owner's slot and promote candidate B —
    // completes without contention since, from txn1's own perspective,
    // there is exactly one Owner row throughout.
    await runner1.query(
      `UPDATE workspace_memberships
          SET workspace_role_id = $1, workspace_role_kind = 'custom', updated_at = now()
        WHERE user_id = $2`,
      [graph.replacementRoleId, graph.ownerUserId],
    );
    await runner1.query(
      `UPDATE workspace_memberships
          SET workspace_role_id = $1, workspace_role_kind = 'workspace_owner', updated_at = now()
        WHERE user_id = $2`,
      [graph.ownerRoleId, graph.candidateBId],
    );

    // txn2: races the same demotion of the same current-Owner row, so it
    // blocks on that row lock until txn1 finishes — genuine concurrency,
    // not two sequential calls.
    const txn2 = (async () => {
      await runner2.query(
        `UPDATE workspace_memberships
            SET workspace_role_id = $1, workspace_role_kind = 'custom', updated_at = now()
          WHERE user_id = $2`,
        [graph.candidateCRoleId, graph.ownerUserId],
      );
      await runner2.query(
        `UPDATE workspace_memberships
            SET workspace_role_id = $1, workspace_role_kind = 'workspace_owner', updated_at = now()
          WHERE user_id = $2`,
        [graph.ownerRoleId, graph.candidateCId],
      );
    })();
    txn2.catch(() => undefined);

    // Confirm txn2 is genuinely blocked (on the shared current-Owner
    // membership row) before letting txn1 commit — this is what makes the
    // interleaving deliberate rather than accidental. (These are raw
    // `UPDATE` statements with no `FROM` clause, so `blockedOnRelation`'s
    // `SELECT`-oriented parsing does not apply here; wait state alone is
    // enough, since both sides only ever contend on `workspace_memberships`.)
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const [row] = await dataSource.query(
        `SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1`,
        [pid2],
      );
      if (row?.wait_event_type === 'Lock') {
        break;
      }
      if (attempt === 199) {
        throw new Error(
          'txn2 never blocked on the shared current-Owner membership row before txn1 committed',
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 15));
    }

    await runner1.commitTransaction();
    await runner1.release();

    await expect(txn2).rejects.toThrow(
      /duplicate key value violates unique constraint "uq_workspace_memberships_one_owner"/u,
    );
    await runner2.rollbackTransaction();
    await runner2.release();

    expect(await ownerCount(graph.workspaceId)).toBe(1);
    const owner = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({
        workspaceId: graph.workspaceId,
        workspaceRoleKind: 'workspace_owner',
      });
    expect(owner).toMatchObject({ userId: graph.candidateBId });
  }, 20_000);
};

describeIntegration('WorkspaceOwnerTransferRepository', () => {
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

  registerLockOrderTest();
  registerConstraintIsFinalArbiterTest();
});
