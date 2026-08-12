import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository';
import {
  workspaceOwnerTransferRequiredError,
  workspaceTargetUnavailableError,
} from 'workspaces/domain/errors/workspace.errors';

export interface AssignWorkspaceRoleInput {
  readonly targetUserId: string;
  readonly workspaceRoleId: string;
}

export interface AssignWorkspaceRoleResult {
  readonly userId: string;
  readonly workspaceRoleId: string;
}

@Injectable()
export class AssignWorkspaceRoleCommand {
  constructor(
    private readonly workspaceMembershipRepository: WorkspaceMembershipRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: WorkspaceCurrentUser,
    input: AssignWorkspaceRoleInput,
  ): Promise<AssignWorkspaceRoleResult> {
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
    // AC-22 — the current Owner is never a legal reassignment operand.
    assert(
      membership.workspaceRoleKind !== 'workspace_owner',
      workspaceOwnerTransferRequiredError(),
    );

    // AC-22 — nor is the protected Owner Role a legal destination; identified
    // by comparison with the current Owner's own Role, since only that
    // membership ever holds it.
    const ownerMembership =
      await this.workspaceMembershipRepository.lockOwnerMembership(
        currentUser.workspaceId,
      );
    assert(
      input.workspaceRoleId !== ownerMembership?.workspaceRoleId,
      workspaceOwnerTransferRequiredError(),
    );

    // AC-19b — exactly one Workspace Role after reassignment; no Warehouse
    // membership or Role changes.
    await this.workspaceMembershipRepository.reassignMembership(
      input.targetUserId,
      input.workspaceRoleId,
      'custom',
    );

    return {
      userId: input.targetUserId,
      workspaceRoleId: input.workspaceRoleId,
    };
  }
}
