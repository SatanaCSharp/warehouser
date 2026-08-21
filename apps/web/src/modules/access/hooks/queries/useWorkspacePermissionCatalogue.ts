import { WorkspacePermissionId } from '@warehouser/shared-types/enums';

import { useListWorkspacePermissionsQuery } from 'modules/access/api/workspace-roles-api';
import {
  hasWorkspacePermission,
  useCurrentWorkspaceContext,
} from 'shared/hooks/queries/useWorkspacePermissions';

import type { WorkspacePermission } from '@warehouser/contracts/workspaces';

export type WorkspacePermissionCatalogue = {
  /**
   * Whether the answer is final: the read completed, or the actor may not make
   * it at all. A surface that grants from the catalogue waits for this rather
   * than showing a Role's Permission rows a heartbeat after its name.
   *
   * The Workspace context is part of that answer, exactly as it is for
   * `useWorkspaceRoles`: until it resolves the actor holds no Permission *yet*
   * rather than none at all.
   */
  isReady: boolean;
  /** Every system Workspace Permission, assignable and reserved alike. */
  permissions: WorkspacePermission[];
};

/**
 * The system Workspace Permission catalogue every Workspace Role form grants
 * from, and the Permissions tab lists (AC-18, AC-32).
 *
 * The gate belongs to the read, so no caller repeats the `skip` condition:
 * without `WORKSPACE_ROLES:WATCH` the catalogue is never requested and never
 * retained. Every caller — the Roles tab, the create action, the inline editor
 * and the Permissions tab — is served from the one cache entry.
 */
export const useWorkspacePermissionCatalogue =
  (): WorkspacePermissionCatalogue => {
    const { isLoading, workspacePermissionIds } = useCurrentWorkspaceContext();
    const canWatchWorkspaceRoles = hasWorkspacePermission(
      workspacePermissionIds,
      WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
    );
    const { data } = useListWorkspacePermissionsQuery(undefined, {
      skip: !canWatchWorkspaceRoles,
    });

    return {
      isReady: !isLoading && (!canWatchWorkspaceRoles || data !== undefined),
      permissions: data ?? [],
    };
  };
