import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository';
import { workspaceTargetUnavailableError } from 'shared/errors/cross-module.errors';
import {
  workspaceMemberExistsError,
  workspaceOwnerTransferRequiredError,
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
    private readonly workspaceRoleLifecycleRepository: WorkspaceRoleLifecycleRepository,
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

    // AC-19/AC-34 — the chosen Workspace Role is a target of this command too,
    // so it is resolved before it is assigned instead of being left to the
    // composite foreign key on `workspace_roles(id, workspace_id, kind)`: a
    // `QueryFailedError` is not a documented outcome and reached the client as
    // a generic 500 where openapi.yaml documents 404
    // `workspace.target_unavailable`. `findCustomRole` is scoped to
    // `(workspaceId, roleId, kind: 'custom')`, so a nonexistent Role and a
    // Role of another Workspace resolve to the identical refusal and neither
    // discloses the other Workspace's Role. It runs *after* the AC-22 check
    // above so the protected Owner Role — which this lookup also excludes —
    // keeps its own `workspace.owner_transfer_required` outcome instead of
    // collapsing into the unavailable-target one.
    const workspaceRole =
      await this.workspaceRoleLifecycleRepository.findCustomRole(
        currentUser.workspaceId,
        input.workspaceRoleId,
      );
    assertDefined(workspaceRole, workspaceTargetUnavailableError());

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
      workspaceRoleId: workspaceRole.id,
      workspaceRoleKind: 'custom',
    });

    return {
      userId: input.candidateUserId,
      workspaceRoleId: input.workspaceRoleId,
    };
  }
}
