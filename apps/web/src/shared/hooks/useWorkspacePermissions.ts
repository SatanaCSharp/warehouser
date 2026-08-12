import { WorkspacePermissionId as WorkspacePermissionIdValue } from '@warehouser/shared-types/enums';

import { useGetWorkspaceContextQuery } from 'shared/api/workspace-context-api';

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

// The three watch Permissions that independently open the Workspace
// administration destination (AC-30, AC-32, AC-33): holding any one of them
// is enough, because each gates its own tab rather than the destination as a
// whole.
export const workspaceAdministrationWatchPermissionIds: readonly WorkspacePermissionId[] =
  [
    WorkspacePermissionIdValue.WAREHOUSES_WATCH,
    WorkspacePermissionIdValue.WORKSPACE_ROLES_WATCH,
    WorkspacePermissionIdValue.WORKSPACE_MEMBERS_WATCH,
  ];
