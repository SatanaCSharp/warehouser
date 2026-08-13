import { Injectable } from '@nestjs/common';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { Maybe } from '@warehouser/shared-types/utils';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WorkspaceCurrentUserRepository } from 'shared/domain/repositories/workspace-current-user.repository';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository';
import { withUnavailableOutcome } from 'workspaces/domain/errors/unavailable-outcome';
import {
  workspaceProtectedRoleError,
  workspaceReplacementRoleRequiredError,
  workspaceRoleAssignmentRequiredError,
  workspaceRoleDeletionUnavailableError,
  workspaceTargetUnavailableError,
} from 'workspaces/domain/errors/workspace.errors';
import { isProtectedWorkspaceOwnerRoleKind } from 'workspaces/domain/predicates/workspace-authority.predicates';
import { WorkspaceRoleDeletionService } from 'workspaces/domain/services/workspace-role-deletion.service';

export interface DeleteWorkspaceRoleInput {
  readonly roleId: string;
  readonly replacementRoleId?: Maybe<string>;
}

export interface DeleteWorkspaceRoleResult {
  readonly id: string;
}

// Mirrors `access/usecases/commands/delete-role.command.ts` one level up
// (sad.md §6.7): deletes an unassigned Workspace Role outright, and, when
// assigned, moves every affected Member to a validated replacement custom
// Role and deletes the Role in the same transaction (AC-17). The protected
// Workspace Owner Role is never deletable (AC-16); deleting an *assigned*
// Role additionally requires `WORKSPACE_ROLES:ASSIGN` on top of the guard's
// `WORKSPACE_ROLES:DELETE` (AC-17d), re-resolved here because the guard only
// proves the single decorated Permission.
@Injectable()
export class DeleteWorkspaceRoleCommand {
  constructor(
    private readonly workspaceRoleLifecycleRepository: WorkspaceRoleLifecycleRepository,
    private readonly workspaceRoleDeletionService: WorkspaceRoleDeletionService,
    private readonly workspaceCurrentUserRepository: WorkspaceCurrentUserRepository,
  ) {}

  @Transactional()
  execute(
    currentUser: WorkspaceCurrentUser,
    input: DeleteWorkspaceRoleInput,
  ): Promise<DeleteWorkspaceRoleResult> {
    // AC-17b — openapi.yaml documents 503 `workspace.role_deletion_unavailable`
    // for a deletion that did not complete, and the one transaction this
    // command runs in is what makes its promise true: the Role and its
    // assignments are unchanged. `withUnavailableOutcome` re-raises the AC-16
    // and AC-17c/AC-17d rejections asserted below untouched, so a permanent
    // refusal is never reported as "try again later".
    return withUnavailableOutcome(
      () => this.deleteRole(currentUser, input),
      workspaceRoleDeletionUnavailableError,
    );
  }

  private async deleteRole(
    currentUser: WorkspaceCurrentUser,
    input: DeleteWorkspaceRoleInput,
  ): Promise<DeleteWorkspaceRoleResult> {
    const role = await this.workspaceRoleLifecycleRepository.lockRoleById(
      currentUser.workspaceId,
      input.roleId,
    );
    assertDefined(role, workspaceTargetUnavailableError());
    assert(
      !isProtectedWorkspaceOwnerRoleKind(role.kind),
      workspaceProtectedRoleError(),
    );

    const assignedCount =
      await this.workspaceRoleLifecycleRepository.countRoleMembers(
        currentUser.workspaceId,
        input.roleId,
      );
    const isAssigned = assignedCount > 0;
    assert(
      !isAssigned || Boolean(input.replacementRoleId),
      workspaceReplacementRoleRequiredError(),
    );

    if (isAssigned) {
      const assignPermission =
        await this.workspaceCurrentUserRepository.resolveRequiredWorkspacePermission(
          currentUser.userId,
          WorkspacePermissionId.WORKSPACE_ROLES_ASSIGN,
        );
      assert(
        Boolean(assignPermission?.granted),
        workspaceRoleAssignmentRequiredError(),
      );
    }

    await this.workspaceRoleDeletionService.replaceAssignments(
      currentUser.workspaceId,
      input.roleId,
      input.replacementRoleId,
    );

    await this.workspaceRoleLifecycleRepository.removeCustomRole(
      currentUser.workspaceId,
      input.roleId,
    );

    return { id: input.roleId };
  }
}
