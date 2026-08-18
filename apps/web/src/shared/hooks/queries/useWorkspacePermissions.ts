import { WorkspacePermissionId as WorkspacePermissionIdValue } from '@warehouser/shared-types/enums';

import { useGetWorkspaceContextQuery } from 'shared/api/workspace/workspace-context-api';

import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';

/**
 * Whether the actor holds the required Workspace Permission, or any one of
 * several: a Workspace destination is open as soon as one of the watch
 * Permissions gating its sections is held (AC-30).
 */
export const hasWorkspacePermission = (
  workspacePermissionIds: readonly WorkspacePermissionId[],
  permission: WorkspacePermissionId | readonly WorkspacePermissionId[],
): boolean =>
  (Array.isArray(permission) ? permission : [permission]).some(
    (required: WorkspacePermissionId) =>
      workspacePermissionIds.includes(required),
  );

export type CurrentWorkspaceContext = {
  isLoading: boolean;
  workspaceContext: WorkspaceContext | undefined;
  workspacePermissionIds: readonly WorkspacePermissionId[];
};

export const useCurrentWorkspaceContext = (): CurrentWorkspaceContext => {
  const { data, isLoading } = useGetWorkspaceContextQuery();
  return {
    isLoading,
    workspaceContext: data,
    workspacePermissionIds: data?.workspacePermissionIds ?? [],
  };
};

export const useHasWorkspacePermission = (
  permission: WorkspacePermissionId | readonly WorkspacePermissionId[],
): boolean => {
  const { workspacePermissionIds } = useCurrentWorkspaceContext();
  return hasWorkspacePermission(workspacePermissionIds, permission);
};

/**
 * Every Workspace Permission that independently opens the Workspace
 * administration destination (AC-29, AC-30, AC-32, AC-33). Holding any one of
 * them is enough, because each gates its own part of that destination rather
 * than the destination as a whole: the three watch Permissions each open one
 * tab, and `WORKSPACE:RENAME` opens the naming control in the header above
 * them. This is the single set the navigation entry, the route guard and the
 * destination's own contents must agree on — a Permission missing here is a
 * Permission its holder can never exercise, because the web redirects them
 * away from the only place that offers it.
 */
export const workspaceAdministrationPermissionIds: readonly WorkspacePermissionId[] =
  [
    WorkspacePermissionIdValue.WAREHOUSES_WATCH,
    WorkspacePermissionIdValue.WORKSPACE_ROLES_WATCH,
    WorkspacePermissionIdValue.WORKSPACE_MEMBERS_WATCH,
    WorkspacePermissionIdValue.WORKSPACE_RENAME,
  ];
