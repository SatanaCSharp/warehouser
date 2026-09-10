import { Injectable } from '@nestjs/common';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { Maybe } from '@warehouser/shared-types/utils';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import {
  workspaceProtectedRoleError,
  workspaceReplacementRoleRequiredError,
  workspaceRoleAssignmentRequiredError,
} from 'access/domain/errors/workspace-access.errors';
import { isProtectedWorkspaceOwnerRoleKind } from 'access/domain/predicates/workspace-authority.predicates';
import { WorkspaceRoleDeletionService } from 'access/domain/services/workspace-role-deletion.service';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WorkspaceCurrentUserRepository } from 'shared/domain/repositories/workspace-current-user.repository';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository';
import { workspaceTargetUnavailableError } from 'shared/errors/cross-module.errors';

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
  async execute(
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
