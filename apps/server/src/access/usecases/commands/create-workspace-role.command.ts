import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import {
  workspaceRoleNameConflictError,
  workspaceSystemManagedPermissionError,
} from 'access/domain/errors/workspace-access.errors';
import {
  isKnownWorkspacePermission,
  isReservedWorkspaceOwnerReassignPermission,
  isReservedWorkspacePermissionKind,
} from 'access/domain/predicates/workspace-authority.predicates';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository';
import type { WorkspacePermissionGrant } from 'shared/domain/repositories/workspace-role-lifecycle.repository';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository';
import { AccessName } from 'shared/domain/value-objects/access-name';
import { validatedName } from 'shared/errors/invalid-name.error';

// Trims, validates and returns a storable Workspace Role name via the shared
// `AccessName` value object (AC-15a). Preserves submitted Unicode without
// normalization (AC-14a) — only whitespace trimming is applied. Exported for
// `update-workspace-role.command.ts` to reuse, mirroring
// `rename-warehouse.command.ts` reusing `create-warehouse.command.ts`'s
// `validateWarehouseName`.
export const validateWorkspaceRoleName = (input: string): string =>
  validatedName(() => AccessName.create(input).value);

// AC-18 — every submitted Workspace Permission id must exist in the system
// catalogue, be `assignable` (never `reserved`), and never be the reserved
// `WORKSPACE_OWNER_ROLE:REASSIGN` Permission regardless of its catalogue
// `kind`. Returns the matching catalogue rows (deduplicated) for the caller
// to hand to `WorkspaceRoleLifecycleRepository`. Exported for
// `update-workspace-role.command.ts` to reuse.
export const assertAssignableWorkspacePermissions = async (
  workspaceReadRepository: WorkspaceReadRepository,
  permissionIds: readonly string[],
): Promise<readonly WorkspacePermissionGrant[]> => {
  const catalogue =
    await workspaceReadRepository.listWorkspacePermissionCatalogue();
  const catalogueIds = catalogue.map((permission) => permission.id);
  const catalogueById = new Map(
    catalogue.map((permission) => [permission.id, permission] as const),
  );

  const uniqueIds = [...new Set(permissionIds)];
  for (const permissionId of uniqueIds) {
    assert(
      isKnownWorkspacePermission(catalogueIds, permissionId),
      workspaceSystemManagedPermissionError(),
    );
    assert(
      !isReservedWorkspaceOwnerReassignPermission(permissionId),
      workspaceSystemManagedPermissionError(),
    );
    const catalogueEntry = catalogueById.get(permissionId);
    assert(
      catalogueEntry !== undefined &&
        !isReservedWorkspacePermissionKind(catalogueEntry.kind),
      workspaceSystemManagedPermissionError(),
    );
  }

  return uniqueIds.map((permissionId) => {
    const catalogueEntry = catalogueById.get(permissionId);
    assert(
      catalogueEntry !== undefined,
      workspaceSystemManagedPermissionError(),
    );
    return { id: catalogueEntry.id, kind: catalogueEntry.kind };
  });
};

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

export interface CreateWorkspaceRoleRuntime {
  readonly roleId: () => string;
}

const defaultCreateWorkspaceRoleRuntime: CreateWorkspaceRoleRuntime = {
  roleId: randomUUID,
};

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
    @Optional()
    private readonly createWorkspaceRoleRuntime: CreateWorkspaceRoleRuntime = defaultCreateWorkspaceRoleRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: WorkspaceCurrentUser,
    input: CreateWorkspaceRoleInput,
  ): Promise<WorkspaceRoleWriteProjection> {
    const name = validateWorkspaceRoleName(input.name);
    const id = this.createWorkspaceRoleRuntime.roleId();

    const permissions = await assertAssignableWorkspacePermissions(
      this.workspaceReadRepository,
      input.permissionIds,
    );

    const matchingRole =
      await this.workspaceRoleLifecycleRepository.findRoleByName(
        currentUser.workspaceId,
        name,
      );
    assert(matchingRole === null, workspaceRoleNameConflictError());

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
