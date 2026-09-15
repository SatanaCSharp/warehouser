import { assert, assertDefined } from '@warehouser/utils/asserts';
import { isDefined } from '@warehouser/utils/predicates';
import { workspaceSystemManagedPermissionError } from 'access/domain/errors/workspace-access.errors';
import {
  isKnownWorkspacePermission,
  isReservedWorkspaceOwnerReassignPermission,
  isReservedWorkspacePermissionKind,
} from 'access/domain/predicates/workspace-authority.predicates';
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository';
import type { WorkspacePermissionGrant } from 'shared/domain/repositories/workspace-role-lifecycle.repository';

// AC-18 — every submitted Workspace Permission id must exist in the system
// catalogue, be `assignable` (never `reserved`), and never be the reserved
// `WORKSPACE_OWNER_ROLE:REASSIGN` Permission regardless of its catalogue
// `kind`. Returns the matching catalogue rows (deduplicated) for the caller
// to hand to `WorkspaceRoleLifecycleRepository`. Shared by
// `create-workspace-role.command.ts` and `update-workspace-role.command.ts`, which ask the
// identical question of the catalogue.
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
      isDefined(catalogueEntry) &&
        !isReservedWorkspacePermissionKind(catalogueEntry.kind),
      workspaceSystemManagedPermissionError(),
    );
  }

  return uniqueIds.map((permissionId) => {
    const catalogueEntry = catalogueById.get(permissionId);
    assertDefined(catalogueEntry, workspaceSystemManagedPermissionError());
    return { id: catalogueEntry.id, kind: catalogueEntry.kind };
  });
};
