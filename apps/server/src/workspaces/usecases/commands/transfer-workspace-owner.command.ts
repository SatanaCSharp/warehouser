import { Injectable } from '@nestjs/common';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { assert } from '@warehouser/utils/asserts';
import { workspaceDeniedError } from 'shared/access/access-denial.errors';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository';
import { WorkspaceOwnerTransferRepository } from 'shared/domain/repositories/workspace-owner-transfer.repository';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository';
import {
  workspaceConcurrentChangeError,
  workspaceReplacementRoleRequiredError,
  workspaceSelfActionDeniedError,
  workspaceTargetUnavailableError,
} from 'workspaces/domain/errors/workspace.errors';
import {
  hasAvailableCustomWorkspaceRole,
  isMembershipSelfTarget,
} from 'workspaces/domain/predicates/workspace-authority.predicates';

export interface TransferWorkspaceOwnerInput {
  readonly recipientUserId: string;
  readonly currentOwnerReplacementRoleId: string;
}

export interface TransferWorkspaceOwnerResult {
  readonly ownerId: string;
}

// Promotes `input.recipientUserId` to sole Workspace Owner and reassigns the
// current Owner to `input.currentOwnerReplacementRoleId` as one outcome
// (AC-26, sad.md §6.7). `WorkspaceAccessGuard` already enforces
// `WORKSPACE_OWNER_ROLE:REASSIGN` at the REST boundary; this command
// re-checks it and the actor's Owner `workspaceRoleKind` itself
// (defense-in-depth for a protected-Role transfer, AC-27), exactly as
// `TransferWarehouseManagerCommand` re-checks `roleKind` one level down.
@Injectable()
export class TransferWorkspaceOwnerCommand {
  constructor(
    private readonly workspaceOwnerTransferRepository: WorkspaceOwnerTransferRepository,
    private readonly workspaceMembershipRepository: WorkspaceMembershipRepository,
    private readonly workspaceRoleLifecycleRepository: WorkspaceRoleLifecycleRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: WorkspaceCurrentUser,
    input: TransferWorkspaceOwnerInput,
  ): Promise<TransferWorkspaceOwnerResult> {
    // AC-27 — only the current Workspace Owner holding the protected
    // `WORKSPACE_OWNER_ROLE:REASSIGN` Permission may ever transfer ownership.
    assert(
      currentUser.workspaceRoleKind === 'workspace_owner' &&
        currentUser.permissionId ===
          WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN,
      workspaceDeniedError(),
    );

    // AC-26a — the outgoing Owner must end the transfer holding exactly one
    // custom Workspace Role, so a custom Role of this Workspace must resolve
    // for the selected id. `findCustomRole` is scoped to
    // `(workspaceId, roleId, kind: 'custom')`, so one lookup rejects a
    // Workspace with no custom Role at all, a Role of another Workspace, and
    // the protected Owner Role alike. Checked ahead of recipient targeting
    // because a Workspace whose only Role is the protected Owner Role has no
    // eligible recipient either — every membership carries exactly one Role —
    // so AC-26a would otherwise be unreachable. Shares
    // `DeleteWorkspaceRoleCommand`'s replacement-Role code (AC-17c/AC-26a).
    const replacementRole =
      await this.workspaceRoleLifecycleRepository.findCustomRole(
        currentUser.workspaceId,
        input.currentOwnerReplacementRoleId,
      );
    assert(
      hasAvailableCustomWorkspaceRole(replacementRole ? 1 : 0),
      workspaceReplacementRoleRequiredError(),
    );

    // AC-28 — the Owner never selects themself as the recipient.
    assert(
      !isMembershipSelfTarget(currentUser.userId, input.recipientUserId),
      workspaceSelfActionDeniedError(),
    );

    // AC-28 — the recipient must be a Workspace Member of this same
    // Workspace; a nonmember and a Member of another Workspace fail
    // identically, mirroring AC-34's pattern. Every User of a Workspace holds
    // exactly one Workspace membership, so `users.workspace_id` is an
    // equivalent membership test here. It is deliberately the non-locking
    // read (`findUserWorkspaceId`, the same one
    // `AssignWarehouseMembershipCommand` uses for its own AC-24
    // cross-Workspace check) rather than `lockMembership`, so this command
    // never takes a `workspace_memberships` row lock ahead of
    // `WorkspaceOwnerTransferRepository.transfer`'s own `workspaces`-row lock
    // — data-model.md's "Repository boundaries, transactions and locking"
    // requires the `workspaces` row to be locked first among
    // Workspace-level rows, and `transfer` owns that lock internally.
    const recipientWorkspaceId =
      await this.workspaceMembershipRepository.findUserWorkspaceId(
        input.recipientUserId,
      );
    assert(
      recipientWorkspaceId === currentUser.workspaceId,
      workspaceTargetUnavailableError(),
    );

    // AC-26 — promotion and reassignment happen in one statement inside one
    // transaction so the two halves can never half-apply (spec.md §6.1's
    // owner-transfer split-brain abuse case). `transfer` locks the
    // `workspaces` row, then both membership rows in `user_id` order, and
    // re-checks their composite Role relations under those locks; a stale
    // precondition or a losing concurrent transfer both surface as one
    // stable, retriable code, with exactly one Owner surviving either way.
    const transferred = await this.workspaceOwnerTransferRepository.transfer({
      workspaceId: currentUser.workspaceId,
      currentOwnerUserId: currentUser.userId,
      currentOwnerReplacementRoleId: input.currentOwnerReplacementRoleId,
      recipientUserId: input.recipientUserId,
      ownerRoleId: currentUser.workspaceRoleId,
    });
    assert(transferred, workspaceConcurrentChangeError());

    return { ownerId: input.recipientUserId };
  }
}
