import { WorkspacePermissionId } from '@warehouser/shared-types/enums';

import { useListWorkspaceUsersQuery } from 'modules/workspace/api/workspace-users-api';
import { useHasWorkspacePermission } from 'shared/hooks/useWorkspacePermissions';

import type { WorkspaceUser } from '@warehouser/contracts/workspaces';

/**
 * The Users of the Workspace with the Warehouses each belongs to — and never a
 * Warehouse Role, which this read does not carry (AC-33, design-handoff.md
 * §"The level boundary is part of the design"). Gated by
 * `WORKSPACE_MEMBERS:WATCH`, the same Permission that opens the Members read it
 * supplies candidates for.
 */
export const useWorkspaceUsers = (): WorkspaceUser[] | undefined => {
  const canWatchWorkspaceMembers = useHasWorkspacePermission(
    WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
  );
  const { data } = useListWorkspaceUsersQuery(undefined, {
    skip: !canWatchWorkspaceMembers,
  });

  return data;
};
