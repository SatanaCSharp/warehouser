import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import { workspaceOwnerTransferRequiredError } from 'access/domain/errors/workspace-access.errors';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository';
import { workspaceTargetUnavailableError } from 'shared/errors/cross-module.errors';

export interface RemoveWorkspaceMemberInput {
  readonly targetUserId: string;
}

export interface RemoveWorkspaceMemberResult {
  readonly userId: string;
}

@Injectable()
export class RemoveWorkspaceMemberCommand {
  constructor(
    private readonly workspaceMembershipRepository: WorkspaceMembershipRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: WorkspaceCurrentUser,
    input: RemoveWorkspaceMemberInput,
  ): Promise<RemoveWorkspaceMemberResult> {
    const membership = await this.workspaceMembershipRepository.lockMembership(
      input.targetUserId,
    );
    // AC-34 — a nonmember and a target of another Workspace both fail here,
    // indistinguishably.
    assertDefined(membership, workspaceTargetUnavailableError());
    assert(
      membership.workspaceId === currentUser.workspaceId,
      workspaceTargetUnavailableError(),
    );
    // AC-21a — the current Owner is never removable through this command.
    assert(
      membership.workspaceRoleKind !== 'workspace_owner',
      workspaceOwnerTransferRequiredError(),
    );

    // AC-19a — only the Workspace membership row is removed; every
    // Warehouse membership and Role stays untouched.
    await this.workspaceMembershipRepository.removeMembership(
      input.targetUserId,
    );

    return { userId: input.targetUserId };
  }
}
