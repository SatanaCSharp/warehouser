import { useCallback } from 'react';

import { useAssignWorkspaceRoleMutation } from 'modules/access/api/workspace-members-api';
import { runWorkspaceMutation } from 'shared/api/workspace-mutation';

import type { MutationOutcome } from 'shared/api/mutation-outcome';

export type AssignWorkspaceRole = (
  userId: string,
  workspaceRoleId: string,
) => Promise<MutationOutcome>;

/**
 * Moves a Workspace Member to a different custom Workspace Role. They end up
 * holding exactly that one Role, and no Warehouse membership or Warehouse Role
 * changes (AC-19b).
 */
export const useAssignWorkspaceRole = (): AssignWorkspaceRole => {
  const [assignWorkspaceRole] = useAssignWorkspaceRoleMutation();

  return useCallback(
    (userId, workspaceRoleId) =>
      runWorkspaceMutation(
        'assignWorkspaceRole',
        assignWorkspaceRole({ userId, workspaceRoleId }),
      ),
    [assignWorkspaceRole],
  );
};
