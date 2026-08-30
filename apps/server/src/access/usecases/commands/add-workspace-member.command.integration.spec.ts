import { randomUUID } from 'node:crypto';

import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
// `AddWorkspaceMemberCommand` does not exist yet (T18) — this is the RED for
// AC-19, AC-20, AC-22 and the AC-34/F-3 cross-Workspace-hiding half of the
// add path. Per the task card, spec.md §5 and sad.md §6.6a, the implementer
// creates it as a `@Transactional()` owner: prove the candidate belongs to
// `currentUser.workspaceId` and holds a Warehouse membership somewhere in
// it (AC-20, `workspaceWarehouseMembershipRequiredError` —
// ErrorCode.WORKSPACE_WAREHOUSE_MEMBERSHIP_REQUIRED), refuse an
// already-a-Member candidate (`workspaceMemberExistsError` —
// ErrorCode.WORKSPACE_MEMBER_EXISTS, distinct from AC-20 per F-3), refuse
// the protected Owner Role as the chosen Role
// (`workspaceOwnerTransferRequiredError`, AC-22), and otherwise call
// `WorkspaceMembershipRepository.addMembership`. A missing/cross-Workspace
// candidate and an existing one indistinguishably fail (AC-34) — verified
// below by asserting both surface the identical `WORKSPACE_TARGET_UNAVAILABLE`
// shape.
import { AddWorkspaceMemberCommand } from 'access/usecases/commands/add-workspace-member.command';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
import { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository';
import {
  buildWorkspaceRole,
  persistWorkspaceGraph,
} from 'test/factories/entity-factories';

const now = new Date('2026-08-12T12:00:00.000Z');

interface AddWorkspaceMemberInput {
  readonly candidateUserId: string;
  readonly workspaceRoleId: string;
}
interface AddWorkspaceMemberResult {
  readonly userId: string;
  readonly workspaceRoleId: string;
}
interface AddWorkspaceMemberCommandContract {
  execute(
    currentUser: WorkspaceCurrentUser,
    input: AddWorkspaceMemberInput,
  ): Promise<AddWorkspaceMemberResult>;
}

describe('AddWorkspaceMemberCommand', () => {
  // A hand-constructed command has no `@Transactional()` interceptor, so a
  // pessimistic lock inside it throws `PessimisticLockTransactionRequiredError`
  // unless the call runs inside an already-open transaction. `transactions`
  // stands in for that interceptor here, matching
  // archive-warehouse.command.integration.spec.ts.
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);
  const workspaceMembershipRepository = new WorkspaceMembershipRepository(
    dataSource,
  );
  // T57 — the command resolves the chosen Workspace Role before assigning it
  // (AC-19, AC-34), so it now collaborates with the Role lifecycle repository
  // too.
  const workspaceRoleLifecycleRepository = new WorkspaceRoleLifecycleRepository(
    dataSource,
  );

  const createCommand = (): AddWorkspaceMemberCommandContract =>
    new AddWorkspaceMemberCommand(
      workspaceMembershipRepository,
      workspaceRoleLifecycleRepository,
    );

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, roles, warehouses, workspace_memberships, workspace_role_permissions, workspace_roles, workspace_permissions, users, accounts, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  const seedIdentity = async (
    userId: string,
    workspaceId: string,
    normalizedEmail: string,
  ): Promise<void> => {
    // `fk_users_workspace_id` is `DEFERRABLE INITIALLY DEFERRED` — checked
    // only at this transaction's own commit, so both inserts run inside one
    // transaction (mirrors archive-warehouse.command.integration.spec.ts).
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
    permissionId: WorkspacePermissionId = WorkspacePermissionId.WORKSPACE_MEMBERS_ADD,
  ): WorkspaceCurrentUser => ({
    userId: randomUUID(),
    workspaceId,
    workspaceRoleId: randomUUID(),
    workspaceRoleKind: 'custom',
    permissionId,
  });

  const findMembership = (
    userId: string,
  ): Promise<WorkspaceMembershipEntity | null> =>
    dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId });

  it('AC-19: the candidate holds exactly the assigned custom Workspace Role after being added', async () => {
    const graph = await persistWorkspaceGraph();
    // `graph.memberUserId` already holds a Warehouse membership in
    // `graph.activeWarehouseId` (a Warehouse of this Workspace) and is not
    // yet a Workspace Member — the exact AC-19/AC-20 boundary candidate the
    // fixture is built for.
    const customRole = buildWorkspaceRole({ workspaceId: graph.workspaceId });
    await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .insert(customRole);

    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute(principal(graph.workspaceId), {
        candidateUserId: graph.memberUserId,
        workspaceRoleId: customRole.id as string,
      }),
    );

    expect(result).toMatchObject({
      userId: graph.memberUserId,
      workspaceRoleId: customRole.id,
    });

    const memberships = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findBy({ userId: graph.memberUserId });
    // AC-19b's invariant ("exactly one Workspace Role per Member") applies
    // from the moment membership is granted too.
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({
      workspaceRoleId: customRole.id,
      workspaceRoleKind: 'custom',
    });
  });

  it('AC-20: blocks a candidate with no Warehouse membership in any Warehouse of this Workspace', async () => {
    const graph = await persistWorkspaceGraph();
    const customRole = buildWorkspaceRole({ workspaceId: graph.workspaceId });
    await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .insert(customRole);

    const candidateId = randomUUID();
    await seedIdentity(
      candidateId,
      graph.workspaceId,
      `candidate.${candidateId}@example.test`,
    );

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(principal(graph.workspaceId), {
          candidateUserId: candidateId,
          workspaceRoleId: customRole.id as string,
        }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_WAREHOUSE_MEMBERSHIP_REQUIRED,
    });

    await expect(findMembership(candidateId)).resolves.toBeNull();
  });

  it('AC-19/F-3: blocks an already-a-Workspace-Member candidate with a distinct code from AC-20', async () => {
    const graph = await persistWorkspaceGraph();
    const roleA = buildWorkspaceRole({ workspaceId: graph.workspaceId });
    const roleB = buildWorkspaceRole({ workspaceId: graph.workspaceId });
    await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .insert([roleA, roleB]);

    // `graph.ownerUserId` is already the Workspace Owner (a Workspace
    // Member); attempting to add them again as a plain Member must be
    // rejected with `workspace.member_exists`, not
    // `workspace.warehouse_membership_required` — proving the two AC-20/
    // AC-19 rejections are cause-specific (F-3).
    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(principal(graph.workspaceId), {
          candidateUserId: graph.ownerUserId,
          workspaceRoleId: roleA.id as string,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_MEMBER_EXISTS });

    const stillOwner = await findMembership(graph.ownerUserId);
    expect(stillOwner).toMatchObject({ workspaceRoleId: graph.ownerRoleId });
  });

  it('AC-22: denies assigning the protected Workspace Owner Role through ordinary addition', async () => {
    const graph = await persistWorkspaceGraph();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(principal(graph.workspaceId), {
          candidateUserId: graph.memberUserId,
          workspaceRoleId: graph.ownerRoleId,
        }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_OWNER_TRANSFER_REQUIRED,
    });

    await expect(findMembership(graph.memberUserId)).resolves.toBeNull();
  });

  it('AC-34: a cross-Workspace candidate fails identically to a nonexistent one, disclosing neither', async () => {
    const actingGraph = await persistWorkspaceGraph();
    const otherGraph = await persistWorkspaceGraph();
    const customRole = buildWorkspaceRole({
      workspaceId: actingGraph.workspaceId,
    });
    await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .insert(customRole);

    const nonexistentOutcome = await transactions
      .executeInTransaction({}, () =>
        createCommand().execute(principal(actingGraph.workspaceId), {
          candidateUserId: randomUUID(),
          workspaceRoleId: customRole.id as string,
        }),
      )
      .catch((error: unknown) => error);

    const crossWorkspaceOutcome = await transactions
      .executeInTransaction({}, () =>
        createCommand().execute(principal(actingGraph.workspaceId), {
          // A real User, but of another Workspace entirely.
          candidateUserId: otherGraph.memberUserId,
          workspaceRoleId: customRole.id as string,
        }),
      )
      .catch((error: unknown) => error);

    expect(nonexistentOutcome).toMatchObject({
      code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE,
    });
    expect(crossWorkspaceOutcome).toMatchObject({
      code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE,
    });

    await expect(findMembership(otherGraph.memberUserId)).resolves.toBeNull();
  });
});
