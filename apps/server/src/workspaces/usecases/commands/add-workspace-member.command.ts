import { Injectable } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository';
import {
  workspaceMemberExistsError,
  workspaceOwnerTransferRequiredError,
  workspaceTargetUnavailableError,
  workspaceWarehouseMembershipRequiredError,
} from 'workspaces/domain/errors/workspace.errors';

export interface AddWorkspaceMemberInput {
  readonly candidateUserId: string;
  readonly workspaceRoleId: string;
}

export interface AddWorkspaceMemberResult {
  readonly userId: string;
  readonly workspaceRoleId: string;
}

@Injectable()
export class AddWorkspaceMemberCommand {
  constructor(
    private readonly workspaceMembershipRepository: WorkspaceMembershipRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: WorkspaceCurrentUser,
    input: AddWorkspaceMemberInput,
  ): Promise<AddWorkspaceMemberResult> {
    // AC-34 — a missing candidate and one of another Workspace fail
    // identically; `findUserWorkspaceId` returns `null` for both.
    const candidateWorkspaceId =
      await this.workspaceMembershipRepository.findUserWorkspaceId(
        input.candidateUserId,
      );
    assert(
      candidateWorkspaceId === currentUser.workspaceId,
      workspaceTargetUnavailableError(),
    );

    // AC-19/F-3 — an already-a-Member candidate is refused with a cause
    // distinct from AC-20's Warehouse-membership precondition.
    const existingMembership =
      await this.workspaceMembershipRepository.lockMembership(
        input.candidateUserId,
      );
    assert(existingMembership === null, workspaceMemberExistsError());

    // AC-22 — the protected Owner Role is never assigned through ordinary
    // addition; identified by comparison with the current Owner's own Role,
    // since only that membership ever holds it.
    const ownerMembership =
      await this.workspaceMembershipRepository.lockOwnerMembership(
        currentUser.workspaceId,
      );
    assert(
      input.workspaceRoleId !== ownerMembership?.workspaceRoleId,
      workspaceOwnerTransferRequiredError(),
    );

    // AC-20 — a command-time-only precondition, deliberately not a database
    // constraint (AC-21).
    const hasWarehouseMembership =
      await this.workspaceMembershipRepository.hasWarehouseMembershipInWorkspace(
        input.candidateUserId,
        currentUser.workspaceId,
      );
    assert(hasWarehouseMembership, workspaceWarehouseMembershipRequiredError());

    await this.workspaceMembershipRepository.addMembership({
      userId: input.candidateUserId,
      workspaceId: currentUser.workspaceId,
      workspaceRoleId: input.workspaceRoleId,
      workspaceRoleKind: 'custom',
    });

    return {
      userId: input.candidateUserId,
      workspaceRoleId: input.workspaceRoleId,
    };
  }
}
