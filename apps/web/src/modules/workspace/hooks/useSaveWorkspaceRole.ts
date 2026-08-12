import { useCallback } from 'react';

import { runWorkspaceMutation } from 'modules/workspace/api/workspace-mutation';
import {
  useCreateWorkspaceRoleMutation,
  useUpdateWorkspaceRoleMutation,
} from 'modules/workspace/api/workspace-roles-api';
import {
  workspaceRoleFieldErrorsByCode,
  workspaceRoleNameValidationKey,
} from 'modules/workspace/hooks/workspace-role-name-validation';

import type { WorkspaceRoleWrite } from '@warehouser/contracts/workspaces';
import type { MutationOutcome } from 'modules/workspace/types/workspace.types';

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
