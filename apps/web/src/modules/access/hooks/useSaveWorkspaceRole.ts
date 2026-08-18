import { useCallback } from 'react';

import {
  useCreateWorkspaceRoleMutation,
  useUpdateWorkspaceRoleMutation,
} from 'modules/access/api/workspace-roles-api';
import {
  workspaceRoleFieldErrorsByCode,
  workspaceRoleNameValidationKey,
} from 'modules/access/hooks/workspace-role-name-validation';
import { runWorkspaceMutation } from 'shared/api/workspace/workspace-mutation';

import type { WorkspaceRoleWrite } from '@warehouser/contracts/workspaces';
import type { MutationOutcome } from 'shared/api/client/mutation-outcome';

export type SaveWorkspaceRole = (
  input: WorkspaceRoleWrite,
  workspaceRoleId?: string,
) => Promise<MutationOutcome>;

/**
 * Creates a custom Workspace Role, or updates the one named by
 * `workspaceRoleId` (AC-14, AC-14a). Both write the same name-and-grants pair,
 * so both map a rejected name onto the field that carries it.
 */
export const useSaveWorkspaceRole = (): SaveWorkspaceRole => {
  const [createWorkspaceRole] = useCreateWorkspaceRoleMutation();
  const [updateWorkspaceRole] = useUpdateWorkspaceRoleMutation();

  return useCallback(
    async (input, workspaceRoleId) =>
      workspaceRoleNameValidationKey(
        await runWorkspaceMutation(
          workspaceRoleId ? 'updateWorkspaceRole' : 'createWorkspaceRole',
          workspaceRoleId
            ? updateWorkspaceRole({ workspaceRoleId, ...input })
            : createWorkspaceRole(input),
          (code) => workspaceRoleFieldErrorsByCode[code],
        ),
      ),
    [createWorkspaceRole, updateWorkspaceRole],
  );
};
