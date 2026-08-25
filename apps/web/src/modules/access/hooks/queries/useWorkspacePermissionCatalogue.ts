import { WorkspacePermissionId } from '@warehouser/shared-types/enums';

import { useListWorkspacePermissionsQuery } from 'modules/access/api/workspace-roles-api';
import {
  hasWorkspacePermission,
  useCurrentWorkspaceContext,
} from 'shared/hooks/queries/useWorkspacePermissions';

import type { WorkspacePermission } from '@warehouser/contracts/workspaces';

/**
 * CH-09 — `isReady` is removed (CR-AC-09). The Workspace route's loader awaits
 * this read before the destination paints, so a surface that grants from the
 * catalogue shows its Permission rows with the Role's name rather than after it.
 */
export type WorkspacePermissionCatalogue = {
  /** True when the read was refused or failed, as opposed to returning none. */
  isError: boolean;
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
    const { workspacePermissionIds } = useCurrentWorkspaceContext();
    const canWatchWorkspaceRoles = hasWorkspacePermission(
      workspacePermissionIds,
      WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
    );
    const { data, isError } = useListWorkspacePermissionsQuery(undefined, {
      skip: !canWatchWorkspaceRoles,
    });

    return {
      isError,
      permissions: data ?? [],
    };
  };
