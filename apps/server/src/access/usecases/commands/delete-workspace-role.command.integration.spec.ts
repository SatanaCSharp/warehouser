import { randomUUID } from 'node:crypto';

import { ErrorCode } from '@warehouser/shared-types/enums';
// `WorkspaceRoleDeletionService` does not exist yet either (T17) — see
// workspace-role-deletion.service.spec.ts for its RED.
import { WorkspaceRoleDeletionService } from 'access/domain/services/workspace-role-deletion.service';
// `DeleteWorkspaceRoleCommand` does not exist yet (T17) — this is the RED
// for AC-16, AC-17, AC-17a, AC-17b, AC-17c and AC-17d. Per the task card,
// sad.md §6.7 and data-model.md "Repository boundaries", the implementer
// creates it as a `@Transactional()` owner over
// `WorkspaceRoleLifecycleRepository` and `WorkspaceRoleDeletionService`:
// prove the named Workspace Role belongs to `currentUser.workspaceId`
// (denying without disclosure, mirroring `ArchiveWarehouseCommand`'s AC-10
// pattern), refuse the protected Owner Role (AC-16), and — only when the
// Role is currently assigned — require the actor to also hold
// `WORKSPACE_ROLES:ASSIGN` (re-resolved through
// `WorkspaceCurrentUserRepository`, since the guard only proves the single
// decorated Permission) before delegating to
// `WorkspaceRoleDeletionService.replaceAssignments` and
// `WorkspaceRoleLifecycleRepository.removeCustomRole` inside one
// transaction.
import { DeleteWorkspaceRoleCommand } from 'access/usecases/commands/delete-workspace-role.command';
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
import { WorkspaceCurrentUserRepository } from 'shared/domain/repositories/workspace-current-user.repository';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository';
import {
  buildWorkspace,
  buildWorkspaceMembership,
  buildWorkspaceRole,
} from 'test/factories/entity-factories';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-12T12:00:00.000Z');

// The shape this RED step expects the implementer to expose. Typed
// explicitly (rather than left `error`-typed while the module does not yet
// exist) so every call below goes through this one cast, matching
// `archive-warehouse.command.integration.spec.ts`'s convention.
interface DeleteWorkspaceRoleInput {
  readonly roleId: string;
  readonly replacementRoleId?: string | null;
}
interface DeleteWorkspaceRoleResult {
  readonly id: string;
}
interface DeleteWorkspaceRoleCommandContract {
  execute(
    currentUser: WorkspaceCurrentUser,
    input: DeleteWorkspaceRoleInput,
  ): Promise<DeleteWorkspaceRoleResult>;
}

// eslint-disable-next-line max-lines-per-function -- integration suite setup is inherently long
describeIntegration('DeleteWorkspaceRoleCommand', () => {
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);
  const workspaceRoleLifecycleRepository = new WorkspaceRoleLifecycleRepository(
    dataSource,
  );
  const workspaceRoleDeletionService = new WorkspaceRoleDeletionService(
    workspaceRoleLifecycleRepository,
  );
  const workspaceCurrentUserRepository = new WorkspaceCurrentUserRepository(
    dataSource,
  );

  // `DeleteWorkspaceRoleCommand` is `error`-typed while its module does not
  // exist yet (T17 RED).

  const createCommand = (): DeleteWorkspaceRoleCommandContract =>
    new DeleteWorkspaceRoleCommand(
      workspaceRoleLifecycleRepository,
      workspaceRoleDeletionService,
      workspaceCurrentUserRepository,
    );

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE workspace_role_permissions, workspace_memberships, workspace_roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

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
    // `fk_users_workspace_id` is `DEFERRABLE INITIALLY DEFERRED` — only
    // checked at this transaction's own commit, so both inserts run inside
    // one transaction (matches `archive-warehouse.command.integration
    // .spec.ts`'s `seedIdentity`).
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

  const grantWorkspacePermission = async (
    roleId: string,
    permissionId: string,
  ): Promise<void> => {
    await dataSource.manager
      .getRepository(WorkspaceRolePermissionEntity)
      .insert({
        workspaceRoleId: roleId,
        workspacePermissionId: permissionId,
        workspaceRoleKind: 'custom',
        workspacePermissionKind: 'assignable',
      });
  };

  // Seeds the acting Workspace Member's own custom Role, membership and
  // Permission grants, and returns the `WorkspaceCurrentUser` the command
  // receives — matching what `WorkspaceAccessGuard` would populate.
  const seedActor = async (
    workspaceId: string,
    permissionIds: readonly string[],
  ): Promise<WorkspaceCurrentUser> => {
    const actorRoleId = await seedCustomRole(
      workspaceId,
      `Actor Role ${randomUUID()}`,
    );
    for (const permissionId of permissionIds) {
      await grantWorkspacePermission(actorRoleId, permissionId);
    }

    const userId = randomUUID();
    await seedIdentity(userId, workspaceId, `actor.${userId}@example.test`);
    await dataSource.manager.getRepository(WorkspaceMembershipEntity).insert(
      buildWorkspaceMembership({
        userId,
        workspaceId,
        workspaceRoleId: actorRoleId,
      }),
    );

    return {
      userId,
      workspaceId,
      workspaceRoleId: actorRoleId,
      workspaceRoleKind: 'custom',
      permissionId: 'WORKSPACE_ROLES:DELETE',
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

  it('AC-17a: deletes an unassigned custom Workspace Role, changing no assignment', async () => {
    const workspaceId = await seedWorkspace();
    const actor = await seedActor(workspaceId, ['WORKSPACE_ROLES:DELETE']);
    const unassignedRoleId = await seedCustomRole(
      workspaceId,
      'Unassigned custom Workspace Role',
    );

    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute(actor, { roleId: unassignedRoleId }),
    );

    expect(result).toMatchObject({ id: unassignedRoleId });

    const role = await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .findOneBy({ id: unassignedRoleId });
    expect(role).toBeNull();
  });

  it('AC-17: deleting an assigned Role moves every affected Member to the replacement and deletes the Role as one outcome', async () => {
    const workspaceId = await seedWorkspace();
    const actor = await seedActor(workspaceId, [
      'WORKSPACE_ROLES:DELETE',
      'WORKSPACE_ROLES:ASSIGN',
    ]);
    const sourceRoleId = await seedCustomRole(
      workspaceId,
      'Source custom Role',
    );
    const replacementRoleId = await seedCustomRole(
      workspaceId,
      'Replacement custom Role',
    );
    const memberOneId = await seedMember(workspaceId, sourceRoleId);
    const memberTwoId = await seedMember(workspaceId, sourceRoleId);
    const unrelatedRoleId = await seedCustomRole(workspaceId, 'Unrelated Role');
    const unrelatedMemberId = await seedMember(workspaceId, unrelatedRoleId);

    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute(actor, {
        roleId: sourceRoleId,
        replacementRoleId,
      }),
    );

    expect(result).toMatchObject({ id: sourceRoleId });

    const sourceRole = await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .findOneBy({ id: sourceRoleId });
    expect(sourceRole).toBeNull();

    const memberOne = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: memberOneId });
    const memberTwo = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: memberTwoId });
    expect(memberOne).toMatchObject({ workspaceRoleId: replacementRoleId });
    expect(memberTwo).toMatchObject({ workspaceRoleId: replacementRoleId });

    // No Workspace Member is ever left without exactly one Role.
    const withoutRole = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .countBy({ workspaceId, workspaceRoleId: sourceRoleId });
    expect(withoutRole).toBe(0);

    // Unrelated assignments outside the affected Role stay untouched.
    const unrelatedMember = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: unrelatedMemberId });
    expect(unrelatedMember).toMatchObject({ workspaceRoleId: unrelatedRoleId });
  });

  it('AC-17d: denies deleting an assigned Role when the actor lacks the assignment Permission, while an unassigned Role stays deletable', async () => {
    const workspaceId = await seedWorkspace();
    const actor = await seedActor(workspaceId, ['WORKSPACE_ROLES:DELETE']);
    const sourceRoleId = await seedCustomRole(workspaceId, 'Assigned Role');
    const replacementRoleId = await seedCustomRole(
      workspaceId,
      'Replacement Role',
    );
    const memberId = await seedMember(workspaceId, sourceRoleId);

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor, {
          roleId: sourceRoleId,
          replacementRoleId,
        }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_ROLE_ASSIGNMENT_REQUIRED,
    });

    const untouchedRole = await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .findOneBy({ id: sourceRoleId });
    expect(untouchedRole).not.toBeNull();
    const untouchedMember = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: memberId });
    expect(untouchedMember).toMatchObject({ workspaceRoleId: sourceRoleId });

    // The same actor deleting an *unassigned* Role stays available to them
    // (AC-17a's path never needs the assignment Permission).
    const unassignedRoleId = await seedCustomRole(
      workspaceId,
      'Unassigned Role',
    );
    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute(actor, { roleId: unassignedRoleId }),
    );
    expect(result).toMatchObject({ id: unassignedRoleId });
  });

  it("AC-17c: denies deleting an assigned Role that is the Workspace's only custom Role", async () => {
    const workspaceId = await seedWorkspace();
    const actor = await seedActor(workspaceId, [
      'WORKSPACE_ROLES:DELETE',
      'WORKSPACE_ROLES:ASSIGN',
    ]);
    // `actor`'s own custom Role is the *only* other custom Role in the
    // Workspace, so it cannot serve as `sourceRoleId`'s replacement: this
    // test creates one further custom Role and deletes *that*, leaving no
    // valid replacement other than the protected Owner Role.
    const soleCustomRoleId = await seedCustomRole(
      workspaceId,
      'Sole other custom Role',
    );
    const memberId = await seedMember(workspaceId, soleCustomRoleId);
    await seedOwnerRole(workspaceId);

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor, {
          roleId: soleCustomRoleId,
          // No custom Role other than the actor's own — which the
          // predicate must not surface as a candidate replacement here —
          // exists, so any id supplied resolves to "unavailable". Omitting
          // it entirely exercises the same refusal path.
        }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_REPLACEMENT_ROLE_REQUIRED,
    });

    const untouchedRole = await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .findOneBy({ id: soleCustomRoleId });
    expect(untouchedRole).not.toBeNull();
    const untouchedMember = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: memberId });
    expect(untouchedMember).toMatchObject({
      workspaceRoleId: soleCustomRoleId,
    });
  });

  it('rejects a replacement Role from another Workspace as an unavailable target', async () => {
    const workspaceId = await seedWorkspace();
    const actor = await seedActor(workspaceId, [
      'WORKSPACE_ROLES:DELETE',
      'WORKSPACE_ROLES:ASSIGN',
    ]);
    const sourceRoleId = await seedCustomRole(workspaceId, 'Assigned Role');
    const memberId = await seedMember(workspaceId, sourceRoleId);

    const otherWorkspaceId = await seedWorkspace();
    const foreignReplacementRoleId = await seedCustomRole(
      otherWorkspaceId,
      'Replacement Role of another Workspace',
    );

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor, {
          roleId: sourceRoleId,
          replacementRoleId: foreignReplacementRoleId,
        }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_REPLACEMENT_ROLE_REQUIRED,
    });

    const untouchedRole = await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .findOneBy({ id: sourceRoleId });
    expect(untouchedRole).not.toBeNull();
    const untouchedMember = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: memberId });
    expect(untouchedMember).toMatchObject({ workspaceRoleId: sourceRoleId });
  });

  it('AC-16: refuses to delete the protected Workspace Owner Role', async () => {
    const workspaceId = await seedWorkspace();
    const actor = await seedActor(workspaceId, [
      'WORKSPACE_ROLES:DELETE',
      'WORKSPACE_ROLES:ASSIGN',
    ]);
    const ownerRoleId = await seedOwnerRole(workspaceId);

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor, { roleId: ownerRoleId }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_PROTECTED_ROLE });

    const untouchedRole = await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .findOneBy({ id: ownerRoleId });
    expect(untouchedRole).not.toBeNull();
  });

  it('denies deleting a Workspace Role belonging to another Workspace, indistinguishably from a missing one', async () => {
    const workspaceId = await seedWorkspace();
    const actor = await seedActor(workspaceId, ['WORKSPACE_ROLES:DELETE']);

    const otherWorkspaceId = await seedWorkspace();
    const otherRoleId = await seedCustomRole(
      otherWorkspaceId,
      'Role of another Workspace',
    );

    const missingRoleId = randomUUID();

    const [crossWorkspaceOutcome, missingOutcome] = await Promise.allSettled([
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor, { roleId: otherRoleId }),
      ),
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor, { roleId: missingRoleId }),
      ),
    ]);

    expect(crossWorkspaceOutcome.status).toBe('rejected');
    expect(missingOutcome.status).toBe('rejected');
    expect(
      crossWorkspaceOutcome.status === 'rejected' &&
        crossWorkspaceOutcome.reason,
    ).toMatchObject({ code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE });
    expect(
      missingOutcome.status === 'rejected' && missingOutcome.reason,
    ).toMatchObject({ code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE });

    const untouchedRole = await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .findOneBy({ id: otherRoleId });
    expect(untouchedRole).not.toBeNull();
  });

  it('AC-17b: an injected failure mid-replacement leaves every assignment and the Role unchanged', async () => {
    const workspaceId = await seedWorkspace();
    const actor = await seedActor(workspaceId, [
      'WORKSPACE_ROLES:DELETE',
      'WORKSPACE_ROLES:ASSIGN',
    ]);
    const sourceRoleId = await seedCustomRole(workspaceId, 'Source Role');
    const replacementRoleId = await seedCustomRole(
      workspaceId,
      'Replacement Role',
    );
    const memberId = await seedMember(workspaceId, sourceRoleId);

    // Injects a failure at the last write of the outcome — the Role delete
    // itself — forcing PostgreSQL to roll back every statement this
    // transaction issued, including the membership move that happened
    // first (mirrors `archive-warehouse.command.integration.spec.ts`'s
    // AC-13 trigger-based injection).
    await dataSource.query(`
      CREATE OR REPLACE FUNCTION fail_workspace_role_delete()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.id = '${sourceRoleId}' THEN
          RAISE EXCEPTION 'injected Workspace Role deletion failure';
        END IF;
        RETURN OLD;
      END;
      $$;
      CREATE TRIGGER fail_workspace_role_delete
      BEFORE DELETE ON workspace_roles
      FOR EACH ROW EXECUTE FUNCTION fail_workspace_role_delete();
    `);

    try {
      await expect(
        transactions.executeInTransaction({}, () =>
          createCommand().execute(actor, {
            roleId: sourceRoleId,
            replacementRoleId,
          }),
        ),
      ).rejects.toThrow();
    } finally {
      await dataSource.query(
        'DROP TRIGGER IF EXISTS fail_workspace_role_delete ON workspace_roles',
      );
      await dataSource.query(
        'DROP FUNCTION IF EXISTS fail_workspace_role_delete',
      );
    }

    const untouchedRole = await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .findOneBy({ id: sourceRoleId });
    expect(untouchedRole).not.toBeNull();
    const untouchedMember = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId: memberId });
    expect(untouchedMember).toMatchObject({ workspaceRoleId: sourceRoleId });
  });
});
