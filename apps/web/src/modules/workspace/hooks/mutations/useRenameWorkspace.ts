import { useCallback } from 'react';

import { useRenameWorkspaceMutation } from 'shared/api/workspace/workspace-context-api';
import { runWorkspaceMutation } from 'shared/api/workspace/workspace-mutation';
import { fieldErrorMapFrom } from 'shared/utils/field-errors';
import { nameValidationKeyMapper } from 'shared/utils/name-validation';

import type { WorkspaceRename } from '@warehouser/contracts/workspaces';
import type { MutationOutcome } from 'shared/api/client/mutation-outcome';

export type RenameWorkspace = (
  input: WorkspaceRename,
) => Promise<MutationOutcome>;

/** A rejection that names no rule still binds to the only field this form has. */
const fieldErrorsFor = fieldErrorMapFrom({
  'workspace.invalid_input': { name: 'workspaceName.server' },
});

/** Translates a Workspace-name rejection's rule into its key (AC-29a). */
const workspaceNameValidationKey = nameValidationKeyMapper({
  prefix: 'workspaceName',
  fallbackSuffix: 'server',
});

/** Sets or changes the Workspace's name (AC-29). */
export const useRenameWorkspace = (): RenameWorkspace => {
  const [renameWorkspace] = useRenameWorkspaceMutation();

  return useCallback(
    async (input) =>
      workspaceNameValidationKey(
        await runWorkspaceMutation(
          'renameWorkspace',
          renameWorkspace(input),
          fieldErrorsFor,
        ),
      ),
    [renameWorkspace],
  );
};
