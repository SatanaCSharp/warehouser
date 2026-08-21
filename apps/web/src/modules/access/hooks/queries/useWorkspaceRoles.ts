import { WorkspacePermissionId } from '@warehouser/shared-types/enums';

import { useListWorkspaceRolesQuery } from 'modules/access/api/workspace-roles-api';
import {
  hasWorkspacePermission,
  useCurrentWorkspaceContext,
} from 'shared/hooks/queries/useWorkspacePermissions';

import type { WorkspaceRole } from '@warehouser/contracts/workspaces';

/**
 * CH-09 — `isReady` is removed (CR-AC-09). The Workspace route's loader awaits
 * this read before the destination paints, so nothing waits on it: a member row
 * can name the Role it shows on first paint.
 */
export type WorkspaceRoleChoices = {
  /** Every Workspace Role, which is what names the Role a member holds. */
  roles: WorkspaceRole[];
  /**
   * The Roles a member may be assigned. The protected Workspace Owner Role is
   * excluded here, once, rather than at every select that offers a choice:
   * Workspace Owner changes only through the protected transfer (AC-22).
   */
  customRoles: WorkspaceRole[];
};

/**
 * The Workspace Roles, gated by `WORKSPACE_ROLES:WATCH` (AC-32) so a member who
 * may not read them never requests them. An empty list is the honest answer for
 * that actor: nothing offers a Role choice they cannot name.
 */
export const useWorkspaceRoles = (): WorkspaceRoleChoices => {
  const { workspacePermissionIds } = useCurrentWorkspaceContext();
  const canWatchWorkspaceRoles = hasWorkspacePermission(
    workspacePermissionIds,
    WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
  );
  const { data } = useListWorkspaceRolesQuery(undefined, {
    skip: !canWatchWorkspaceRoles,
  });
  const roles = data ?? [];

  return {
    roles,
    customRoles: roles.filter((role) => role.kind === 'custom'),
  };
};
