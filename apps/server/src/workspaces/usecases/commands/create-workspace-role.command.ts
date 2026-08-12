import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import { ErrorCode } from '@warehouser/shared-types/enums';
import {
  ApplicationError,
  AssertionError,
} from '@warehouser/shared-types/errors';
import { assert } from '@warehouser/utils/asserts';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository';
import type { WorkspacePermissionGrant } from 'shared/domain/repositories/workspace-role-lifecycle.repository';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository';
import { AccessName } from 'shared/domain/value-objects/access-name';
import {
  workspaceRoleNameConflictError,
  workspaceSystemManagedPermissionError,
} from 'workspaces/domain/errors/workspace.errors';
import {
  isKnownWorkspacePermission,
  isReservedWorkspaceOwnerReassignPermission,
  isReservedWorkspacePermissionKind,
} from 'workspaces/domain/predicates/workspace-authority.predicates';

// `AccessName` enforces the Workspace Role name rules (trim, grapheme count,
// control/format detection — a Workspace Role name has no unset state, so it
// is used directly, exactly as `create-warehouse.command.ts`'s
// `validateWarehouseName` does). This map only names *which* broken rule an
// `AssertionError` corresponds to, so AC-15a can tell the caller which one
// failed, mirroring `rename-workspace.command.ts`'s
// `NAME_RULE_BY_ASSERTION_MESSAGE`.
const NAME_RULE_BY_ASSERTION_MESSAGE: Record<string, string> = {
  'Name must not be empty': 'empty',
  'Name must contain at most 100 user-perceived characters': 'grapheme_length',
  'Name must not contain control or format characters':
    'control_or_format_character',
};

// Named error factory (server-error-handling.md §3): every Workspace Role
// name rejection carries `field: 'name'` and the specific rule that was
// broken (AC-15a).
export const workspaceRoleInvalidNameError = (rule: string): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_INVALID_INPUT, {
    field: 'name',
    rule,
  });

// Trims, validates and returns a storable Workspace Role name via the shared
// `AccessName` value object. Preserves submitted Unicode without
// normalization (AC-14a) — only whitespace trimming is applied. Exported for
// `update-workspace-role.command.ts` to reuse, mirroring
// `rename-warehouse.command.ts` reusing `create-warehouse.command.ts`'s
// `validateWarehouseName`.
export const validateWorkspaceRoleName = (input: string): string => {
  try {
    return AccessName.create(input).value;
  } catch (error) {
    if (error instanceof AssertionError) {
      const rule = NAME_RULE_BY_ASSERTION_MESSAGE[error.message] ?? 'invalid';
      throw workspaceRoleInvalidNameError(rule);
    }
    throw error;
  }
};

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
