import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import {
  workspaceProtectedRoleError,
  workspaceRoleNameConflictError,
} from 'access/domain/errors/workspace-access.errors';
import { isProtectedWorkspaceOwnerRoleKind } from 'access/domain/predicates/workspace-authority.predicates';
import type { WorkspaceRoleWriteProjection } from 'access/usecases/commands/create-workspace-role.command';
import {
  assertAssignableWorkspacePermissions,
  validateWorkspaceRoleName,
} from 'access/usecases/commands/create-workspace-role.command';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository';
import { workspaceTargetUnavailableError } from 'shared/errors/cross-module.errors';

export interface UpdateWorkspaceRoleInput {
  readonly roleId: string;
  readonly name: string;
  readonly permissionIds: readonly string[];
}

// `WORKSPACE_ROLES:UPDATE`-guarded: renames and/or replaces the Permission
// membership of a custom Workspace Role scoped to `principal.workspaceId`
// (never a caller-supplied target). A target Role of another Workspace is
// indistinguishable from a missing one (`workspaceTargetUnavailableError()`),
// and the protected Workspace Owner Role is never renamed or re-permissioned
// (AC-16). Mirrors `access/usecases/commands/update-role.command.ts` at the
// Workspace authority level (sad.md §6.7).
@Injectable()
export class UpdateWorkspaceRoleCommand {
  constructor(
    private readonly workspaceRoleLifecycleRepository: WorkspaceRoleLifecycleRepository,
    private readonly workspaceReadRepository: WorkspaceReadRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: WorkspaceCurrentUser,
    input: UpdateWorkspaceRoleInput,
  ): Promise<WorkspaceRoleWriteProjection> {
    const name = validateWorkspaceRoleName(input.name);

    const role = await this.workspaceRoleLifecycleRepository.lockRoleById(
      currentUser.workspaceId,
      input.roleId,
    );
    assertDefined(role, workspaceTargetUnavailableError());
    assert(
      !isProtectedWorkspaceOwnerRoleKind(role.kind),
      workspaceProtectedRoleError(),
    );

    const permissions = await assertAssignableWorkspacePermissions(
      this.workspaceReadRepository,
      input.permissionIds,
    );

    const matchingRole =
      await this.workspaceRoleLifecycleRepository.findRoleByName(
        currentUser.workspaceId,
        name,
      );
    assert(
      matchingRole === null || matchingRole.id === role.id,
      workspaceRoleNameConflictError(),
    );

    await this.workspaceRoleLifecycleRepository.updateCustomRole(role.id, name);
    await this.workspaceRoleLifecycleRepository.replaceCustomRolePermissions(
      role.id,
      permissions,
    );

    // Renaming/re-permissioning a Role never changes who is assigned to it,
    // so the current `assignedMemberCount` is read back from the same
    // aggregation `ListWorkspaceRolesQuery` uses rather than invented here.
    const roles =
      await this.workspaceReadRepository.listWorkspaceRolesWithPermissions(
        currentUser.workspaceId,
      );
    const assignedMemberCount =
      roles.find((candidate) => candidate.id === role.id)
        ?.assignedMemberCount ?? 0;

    return {
      id: role.id,
      name,
      permissionIds: permissions.map((permission) => permission.id),
      assignedMemberCount,
    };
  }
}
