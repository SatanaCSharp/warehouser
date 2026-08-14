import { useCallback } from 'react';

import { useDeleteWorkspaceRoleMutation } from 'modules/workspace/api/workspace-roles-api';
import { runWorkspaceMutation } from 'shared/api/workspace-mutation';

import type { MutationOutcome } from 'shared/api/mutation-outcome';

export type DeleteWorkspaceRole = (
  workspaceRoleId: string,
  replacementWorkspaceRoleId?: string,
) => Promise<MutationOutcome>;

/**
 * Deletes a custom Workspace Role. An assigned Role moves every member holding
 * it to the replacement as one outcome (AC-17); an unassigned one is deleted
 * with no replacement and changes no assignment at all (AC-17a).
 */
export const useDeleteWorkspaceRole = (): DeleteWorkspaceRole => {
  const [deleteWorkspaceRole] = useDeleteWorkspaceRoleMutation();

  return useCallback(
    (workspaceRoleId, replacementWorkspaceRoleId) =>
      runWorkspaceMutation(
        'deleteWorkspaceRole',
        deleteWorkspaceRole({ workspaceRoleId, replacementWorkspaceRoleId }),
      ),
    [deleteWorkspaceRole],
  );
};
