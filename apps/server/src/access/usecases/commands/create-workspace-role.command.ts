import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import { isNull } from '@warehouser/utils/predicates';
import { workspaceRoleNameConflictError } from 'access/domain/errors/workspace-access.errors';
import { assertAssignableWorkspacePermissions } from 'access/domain/services/workspace-role-permissions.service';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository';
import { validatedAccessName } from 'shared/errors/invalid-name.error';

export interface CreateWorkspaceRoleInput {
  readonly name: string;
  readonly permissionIds: readonly string[];
}

export interface WorkspaceRoleWriteProjection {
  readonly id: string;
  readonly name: string;
  readonly permissionIds: readonly string[];
  readonly assignedMemberCount: number;
}

// `WORKSPACE_ROLES:CREATE`-guarded: creates a custom Workspace Role scoped to
// `principal.workspaceId` (never a caller-supplied target), with a
// per-Workspace exactly-unique name (AC-15) and zero or more `assignable`
// catalogue Permissions (AC-14, AC-18). Mirrors
// `access/usecases/commands/create-role.command.ts` at the Workspace
// authority level (sad.md §6.7).
@Injectable()
export class CreateWorkspaceRoleCommand {
  constructor(
    private readonly workspaceRoleLifecycleRepository: WorkspaceRoleLifecycleRepository,
    private readonly workspaceReadRepository: WorkspaceReadRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: WorkspaceCurrentUser,
    input: CreateWorkspaceRoleInput,
  ): Promise<WorkspaceRoleWriteProjection> {
    const name = validatedAccessName(input.name);
    const id = randomUUID();

    const permissions = await assertAssignableWorkspacePermissions(
      this.workspaceReadRepository,
      input.permissionIds,
    );

    const matchingRole =
      await this.workspaceRoleLifecycleRepository.findRoleByName(
        currentUser.workspaceId,
        name,
      );
    assert(isNull(matchingRole), workspaceRoleNameConflictError());

    await this.workspaceRoleLifecycleRepository.createCustomRole(
      { id, workspaceId: currentUser.workspaceId, name },
      permissions,
    );

    // A Role that has just been created is custom by construction and no
    // Workspace Member is assigned to it yet, so `0` is a fact rather than a
    // default.
    return {
      id,
      name,
      permissionIds: permissions.map((permission) => permission.id),
      assignedMemberCount: 0,
    };
  }
}
