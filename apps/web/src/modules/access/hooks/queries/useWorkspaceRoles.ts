import { WorkspacePermissionId } from '@warehouser/shared-types/enums';

import { useListWorkspaceRolesQuery } from 'modules/access/api/workspace-roles-api';
import {
  hasWorkspacePermission,
  useCurrentWorkspaceContext,
} from 'shared/hooks/queries/useWorkspacePermissions';

import type { WorkspaceRole } from '@warehouser/contracts/workspaces';

export type WorkspaceRoleChoices = {
  /**
   * Whether the answer is final: the read completed, or the actor may not make
   * it at all. A member row that would otherwise render before it can name the
   * Role it shows waits for this instead.
   *
   * The Workspace context is part of that answer. Until it resolves, the actor
   * holds no Permission *yet* rather than none at all, so reporting readiness
   * from the Permission alone would call an empty list final for the render
   * before the context arrives.
   */
  isReady: boolean;
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
  const { isLoading, workspacePermissionIds } = useCurrentWorkspaceContext();
  const canWatchWorkspaceRoles = hasWorkspacePermission(
    workspacePermissionIds,
    WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
  );
  const { data } = useListWorkspaceRolesQuery(undefined, {
    skip: !canWatchWorkspaceRoles,
  });
  const roles = data ?? [];

  return {
    isReady: !isLoading && (!canWatchWorkspaceRoles || data !== undefined),
    roles,
    customRoles: roles.filter((role) => role.kind === 'custom'),
  };
};
