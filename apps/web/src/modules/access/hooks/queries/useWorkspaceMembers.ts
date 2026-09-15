import type { WorkspaceMember } from '@warehouser/contracts/workspaces';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useListWorkspaceMembersQuery } from 'modules/access/api/workspace-members-api';
import { useHasWorkspacePermission } from 'shared/hooks/queries/useWorkspacePermissions';

/**
 * The Workspace Members with the one Workspace Role each holds. The dataset
 * owns its own gate, so no caller repeats the `skip` condition: without
 * `WORKSPACE_MEMBERS:WATCH` the read is never requested and never retained
 * (AC-33), and callers see `undefined` exactly as they do while it loads.
 */
export const useWorkspaceMembers = (): WorkspaceMember[] | undefined => {
  const canWatchWorkspaceMembers = useHasWorkspacePermission(
    WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
  );
  const { data } = useListWorkspaceMembersQuery(undefined, {
    skip: !canWatchWorkspaceMembers,
  });

  return data;
};
