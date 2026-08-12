import { useGetWorkspaceContextQuery } from 'shared/api/workspace-context-api';

import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';

export const hasWorkspacePermission = (
  workspacePermissionIds: readonly WorkspacePermissionId[],
  permission: WorkspacePermissionId,
): boolean => workspacePermissionIds.includes(permission);

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
  permission: WorkspacePermissionId,
): boolean => {
  const { workspacePermissionIds } = useCurrentWorkspaceContext();
  return hasWorkspacePermission(workspacePermissionIds, permission);
};
