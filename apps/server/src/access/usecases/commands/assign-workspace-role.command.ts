import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import { workspaceOwnerTransferRequiredError } from 'access/domain/errors/workspace-access.errors.js';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user.js';
import { Transactional } from 'shared/decorators/transactional.decorator.js';
import { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository.js';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository.js';
import { workspaceTargetUnavailableError } from 'shared/errors/cross-module.errors.js';

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
    private readonly workspaceRoleLifecycleRepository: WorkspaceRoleLifecycleRepository,
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

    // AC-19b/AC-34 — the destination Workspace Role is a target of this
    // command too, so it is resolved before it is assigned instead of being
    // left to the composite foreign key on
    // `workspace_roles(id, workspace_id, kind)`: a `QueryFailedError` is not a
    // documented outcome and reached the client as a generic 500 where
    // openapi.yaml documents 404 `workspace.target_unavailable`.
    // `findCustomRole` is scoped to `(workspaceId, roleId, kind: 'custom')`,
    // so a nonexistent Role and a Role of another Workspace resolve to the
    // identical refusal and neither discloses the other Workspace's Role. It
    // runs *after* the AC-22 check above so the protected Owner Role — which
    // this lookup also excludes — keeps its own
    // `workspace.owner_transfer_required` outcome instead of collapsing into
    // the unavailable-target one.
    const workspaceRole =
      await this.workspaceRoleLifecycleRepository.findCustomRole(
        currentUser.workspaceId,
        input.workspaceRoleId,
      );
    assertDefined(workspaceRole, workspaceTargetUnavailableError());

    // AC-19b — exactly one Workspace Role after reassignment; no Warehouse
    // membership or Role changes.
    await this.workspaceMembershipRepository.reassignMembership(
      input.targetUserId,
      workspaceRole.id,
      'custom',
    );

    return {
      userId: input.targetUserId,
      workspaceRoleId: workspaceRole.id,
    };
  }
}
