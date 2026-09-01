import { randomUUID } from 'node:crypto';

import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
// `TransferWorkspaceOwnerCommand` does not exist yet (T19) — this is the RED
// for AC-26, AC-26a and AC-28 (spec.md §5). Per the task card, sad.md §6.7
// and data-model.md "Repository boundaries, transactions and locking", the
// implementer creates it as a `@Transactional()` owner over
// `WorkspaceOwnerTransferRepository.transfer`, `WorkspaceMembershipRepository`
// (recipient targeting, mirroring `AssignWorkspaceRoleCommand`/
// `RemoveWorkspaceMemberCommand`'s AC-34 pattern) and
// `WorkspaceRoleLifecycleRepository.findCustomRole` (the outgoing owner's
// replacement Role, mirroring `DeleteWorkspaceRoleCommand`'s
// `workspaceReplacementRoleRequiredError` use for the shared
// `workspace.replacement_role_required` code, AC-17c/AC-26a). Promotion and
// reassignment happen in one statement inside one transaction so the two
// halves can never half-apply (spec.md §6.1 names owner-transfer split-brain
// as an abuse case).
import { TransferWorkspaceOwnerCommand } from 'access/usecases/commands/transfer-workspace-owner.command';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity';
import { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository';
// `WorkspaceOwnerTransferRepository` already exists (T10) — see
// workspace-owner-transfer.repository.integration.spec.ts for its own RED.
import { WorkspaceOwnerTransferRepository } from 'shared/domain/repositories/workspace-owner-transfer.repository';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository';
import {
  buildWorkspace,
  buildWorkspaceMembership,
  buildWorkspaceRole,
} from 'test/factories/entity-factories';

const now = new Date('2026-08-12T12:00:00.000Z');

// The shape this RED step expects the implementer to expose. Typed
// explicitly (rather than left `error`-typed while the module does not yet
// exist) so every call below goes through this one cast, matching
// `delete-workspace-role.command.integration.spec.ts`'s convention.
interface TransferWorkspaceOwnerInput {
  readonly recipientUserId: string;
  readonly currentOwnerReplacementRoleId: string;
}
interface TransferWorkspaceOwnerResult {
  readonly ownerId: string;
}
interface TransferWorkspaceOwnerCommandContract {
  execute(
    currentUser: WorkspaceCurrentUser,
    input: TransferWorkspaceOwnerInput,
  ): Promise<TransferWorkspaceOwnerResult>;
}

// eslint-disable-next-line max-lines-per-function -- integration suite setup is inherently long
describe('TransferWorkspaceOwnerCommand', () => {
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);
  const ownerTransferRepository = new WorkspaceOwnerTransferRepository(
    dataSource,
  );
  const membershipRepository = new WorkspaceMembershipRepository(dataSource);
  const roleLifecycleRepository = new WorkspaceRoleLifecycleRepository(
    dataSource,
  );

  // `TransferWorkspaceOwnerCommand` is `error`-typed while its module does
  // not exist yet (T19 RED).
  const createCommand = (): TransferWorkspaceOwnerCommandContract =>
    new TransferWorkspaceOwnerCommand(
      ownerTransferRepository,
      membershipRepository,
      roleLifecycleRepository,
    );

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE workspace_role_permissions, workspace_memberships, workspace_roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  }, 20_000);

  afterAll(async () => {
    await dataSource.destroy();
  });

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
    // inside the same transaction (matches
    // `workspace-owner-transfer.repository.integration.spec.ts`'s
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

  const seedCustomRole = async (
    workspaceId: string,
    name: string,
  ): Promise<string> => {
    const role = buildWorkspaceRole({ workspaceId, name });
    await dataSource.manager.getRepository(WorkspaceRoleEntity).insert(role);
    return role.id as string;
  };

  const seedOwnerRole = async (workspaceId: string): Promise<string> => {
    const role = buildWorkspaceRole({
      workspaceId,
      kind: 'workspace_owner',
      name: 'Workspace Owner',
    });
    await dataSource.manager.getRepository(WorkspaceRoleEntity).insert(role);
    return role.id as string;
  };

  // Seeds a current Owner: the protected Owner Role (granted the reserved
  // `WORKSPACE_OWNER_ROLE:REASSIGN` Permission, matching
  // `workspace-permission-vocabulary.spec.ts`), an identity, and the Owner
  // membership. Returns the `WorkspaceCurrentUser` the command receives,
  // matching what `WorkspaceAccessGuard` would populate.
  const seedOwnerActor = async (
    workspaceId: string,
  ): Promise<{ actor: WorkspaceCurrentUser; ownerRoleId: string }> => {
    const ownerRoleId = await seedOwnerRole(workspaceId);
    await dataSource.manager
      .getRepository(WorkspaceRolePermissionEntity)
      .insert({
        workspaceRoleId: ownerRoleId,
        workspacePermissionId: 'WORKSPACE_OWNER_ROLE:REASSIGN',
        workspaceRoleKind: 'workspace_owner',
        workspacePermissionKind: 'reserved',
      });

    const userId = randomUUID();
    await seedIdentity(userId, workspaceId, `owner.${userId}@example.test`);
    await dataSource.manager.getRepository(WorkspaceMembershipEntity).insert(
      buildWorkspaceMembership({
        userId,
        workspaceId,
        workspaceRoleId: ownerRoleId,
        workspaceRoleKind: 'workspace_owner',
      }),
    );

    return {
      actor: {
        userId,
        workspaceId,
        workspaceRoleId: ownerRoleId,
        workspaceRoleKind: 'workspace_owner',
        permissionId: WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN,
      },
      ownerRoleId,
    };
  };

  const seedMember = async (
    workspaceId: string,
    roleId: string,
  ): Promise<string> => {
    const userId = randomUUID();
    await seedIdentity(userId, workspaceId, `member.${userId}@example.test`);
    await dataSource.manager.getRepository(WorkspaceMembershipEntity).insert(
      buildWorkspaceMembership({
        userId,
        workspaceId,
        workspaceRoleId: roleId,
      }),
    );
    return userId;
  };

  const ownerCount = async (workspaceId: string): Promise<number> =>
    dataSource.manager.getRepository(WorkspaceMembershipEntity).countBy({
      workspaceId,
      workspaceRoleKind: 'workspace_owner',
    });

  it('AC-26: promotes the recipient to sole Owner and reassigns the former Owner to the selected custom Role as one outcome', async () => {
    const workspaceId = await seedWorkspace();
    const { actor, ownerRoleId } = await seedOwnerActor(workspaceId);
    const replacementRoleId = await seedCustomRole(
      workspaceId,
      'Replacement custom Role',
    );
    const recipientRoleId = await seedCustomRole(
      workspaceId,
      'Recipient custom Role',
    );
    const recipientId = await seedMember(workspaceId, recipientRoleId);
    const unrelatedRoleId = await seedCustomRole(workspaceId, 'Unrelated Role');
    const unrelatedMemberId = await seedMember(workspaceId, unrelatedRoleId);

    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute(actor, {
        recipientUserId: recipientId,
        currentOwnerReplacementRoleId: replacementRoleId,
      }),
    );

    expect(result).toMatchObject({ ownerId: recipientId });

    const recipientMembership = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: recipientId });
    expect(recipientMembership).toMatchObject({
      workspaceRoleId: ownerRoleId,
      workspaceRoleKind: 'workspace_owner',
    });

    const formerOwnerMembership = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: actor.userId });
    expect(formerOwnerMembership).toMatchObject({
      workspaceRoleId: replacementRoleId,
      workspaceRoleKind: 'custom',
    });

    // Every other Workspace Member's Role is untouched by the transfer.
    const untouchedMember = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: unrelatedMemberId });
    expect(untouchedMember).toMatchObject({ workspaceRoleId: unrelatedRoleId });

    expect(await ownerCount(workspaceId)).toBe(1);
  });

  it('AC-26a: denies the transfer when the Workspace has no custom Workspace Role for the outgoing Owner to receive, preserving exactly one Owner', async () => {
    const workspaceId = await seedWorkspace();
    const { actor } = await seedOwnerActor(workspaceId);
    // No custom Workspace Role exists in this Workspace at all — the only
    // Role row is the protected Owner Role seeded above. Since every
    // Workspace membership carries a required Role, a Workspace with zero
    // custom Roles also has no valid non-Owner recipient candidate; a
    // syntactically well-formed but non-existent id stands in for "no
    // candidate exists either", which is consistent with this Given clause.
    const missingReplacementRoleId = randomUUID();
    const missingRecipientId = randomUUID();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor, {
          recipientUserId: missingRecipientId,
          currentOwnerReplacementRoleId: missingReplacementRoleId,
        }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_REPLACEMENT_ROLE_REQUIRED,
    });

    expect(await ownerCount(workspaceId)).toBe(1);
    const untouchedOwner = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: actor.userId });
    expect(untouchedOwner).toMatchObject({
      workspaceRoleKind: 'workspace_owner',
    });
  });

  // contracts/openapi.yaml gives this route ONE generic unavailable-recipient
  // outcome — "The recipient is the actor, is not a Workspace Member, or is a
  // Workspace Member of another Workspace" — so a self-target answers exactly
  // as the two cases below it do. A distinct `self_action_denied` code would
  // be a signal the other two deliberately withhold (T58 / review S1-09).
  it('AC-28: reports the Owner selecting themself as an unavailable recipient, preserving exactly one Owner', async () => {
    const workspaceId = await seedWorkspace();
    const { actor } = await seedOwnerActor(workspaceId);
    const replacementRoleId = await seedCustomRole(
      workspaceId,
      'Replacement custom Role',
    );

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor, {
          recipientUserId: actor.userId,
          currentOwnerReplacementRoleId: replacementRoleId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE });

    expect(await ownerCount(workspaceId)).toBe(1);
    const untouchedOwner = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: actor.userId });
    expect(untouchedOwner).toMatchObject({
      workspaceRoleKind: 'workspace_owner',
    });
  });

  it('AC-28: denies a recipient who is not a Workspace Member at all, preserving exactly one Owner', async () => {
    const workspaceId = await seedWorkspace();
    const { actor } = await seedOwnerActor(workspaceId);
    const replacementRoleId = await seedCustomRole(
      workspaceId,
      'Replacement custom Role',
    );
    const nonMemberId = randomUUID();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor, {
          recipientUserId: nonMemberId,
          currentOwnerReplacementRoleId: replacementRoleId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE });

    expect(await ownerCount(workspaceId)).toBe(1);
  });

  it('AC-28: denies a recipient who belongs to another Workspace, indistinguishably from a missing one, preserving exactly one Owner', async () => {
    const workspaceId = await seedWorkspace();
    const { actor } = await seedOwnerActor(workspaceId);
    const replacementRoleId = await seedCustomRole(
      workspaceId,
      'Replacement custom Role',
    );

    const otherWorkspaceId = await seedWorkspace();
    const otherRoleId = await seedCustomRole(
      otherWorkspaceId,
      'Role of another Workspace',
    );
    const otherWorkspaceMemberId = await seedMember(
      otherWorkspaceId,
      otherRoleId,
    );

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor, {
          recipientUserId: otherWorkspaceMemberId,
          currentOwnerReplacementRoleId: replacementRoleId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE });

    expect(await ownerCount(workspaceId)).toBe(1);
    const untouchedOtherMember = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: otherWorkspaceMemberId });
    expect(untouchedOtherMember).toMatchObject({
      workspaceRoleId: otherRoleId,
    });
  });

  it('AC-26 atomicity: an injected failure mid-transfer leaves both the promotion and the reassignment unchanged', async () => {
    const workspaceId = await seedWorkspace();
    const { actor, ownerRoleId } = await seedOwnerActor(workspaceId);
    const replacementRoleId = await seedCustomRole(
      workspaceId,
      'Replacement custom Role',
    );
    const recipientRoleId = await seedCustomRole(
      workspaceId,
      'Recipient custom Role',
    );
    const recipientId = await seedMember(workspaceId, recipientRoleId);

    // `WorkspaceOwnerTransferRepository.transfer` promotes and reassigns in
    // one `UPDATE ... CASE` statement; injecting a failure on the promotion
    // half must roll back the whole statement, and hence the reassignment
    // half too, proving the two halves cannot half-apply (spec.md §6.1's
    // owner-transfer split-brain abuse case).
    await dataSource.query(`
      CREATE OR REPLACE FUNCTION fail_workspace_owner_promotion()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.workspace_role_kind = 'workspace_owner'
           AND OLD.workspace_role_kind <> 'workspace_owner' THEN
          RAISE EXCEPTION 'injected Workspace Owner promotion failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER fail_workspace_owner_promotion
      BEFORE UPDATE ON workspace_memberships
      FOR EACH ROW EXECUTE FUNCTION fail_workspace_owner_promotion();
    `);

    try {
      await expect(
        transactions.executeInTransaction({}, () =>
          createCommand().execute(actor, {
            recipientUserId: recipientId,
            currentOwnerReplacementRoleId: replacementRoleId,
          }),
        ),
      ).rejects.toThrow();
    } finally {
      await dataSource.query(
        'DROP TRIGGER IF EXISTS fail_workspace_owner_promotion ON workspace_memberships',
      );
      await dataSource.query(
        'DROP FUNCTION IF EXISTS fail_workspace_owner_promotion',
      );
    }

    const untouchedOwner = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: actor.userId });
    expect(untouchedOwner).toMatchObject({
      workspaceRoleId: ownerRoleId,
      workspaceRoleKind: 'workspace_owner',
    });
    const untouchedRecipient = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: recipientId });
    expect(untouchedRecipient).toMatchObject({
      workspaceRoleId: recipientRoleId,
      workspaceRoleKind: 'custom',
    });
    expect(await ownerCount(workspaceId)).toBe(1);
  });
});
