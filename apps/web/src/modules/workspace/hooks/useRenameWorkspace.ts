import { useCallback } from 'react';

import { runWorkspaceMutation } from 'modules/workspace/api/workspace-mutation';
import { useRenameWorkspaceMutation } from 'shared/api/workspace-context-api';

import type { WorkspaceRename } from '@warehouser/contracts/workspaces';
import type { MutationOutcome } from 'modules/workspace/types/workspace.types';

export type RenameWorkspace = (
  input: WorkspaceRename,
) => Promise<MutationOutcome>;

// A rejected Workspace name arrives as `workspace.invalid_input` naming the
// field and the rule it broke, so the member is told which rule was not met
// rather than that something was wrong (AC-29a).
const validationKeysByRule: Record<string, string> = {
  blank: 'workspaceName.required',
  grapheme_length: 'workspaceName.lengthRange',
  control_or_format_character: 'workspaceName.unsupportedCharacter',
};

// A rejection that names no rule still binds to the only field this form has.
const fieldErrorsByCode: Record<string, Record<string, string>> = {
  'workspace.invalid_input': { name: 'workspaceName.server' },
};

const nameValidationKey = (outcome: MutationOutcome): MutationOutcome => {
  const rule = outcome.fieldErrors?.name;
  return rule
    ? {
        ...outcome,
        fieldErrors: {
          ...outcome.fieldErrors,
          name: validationKeysByRule[rule] ?? 'workspaceName.server',
        },
      }
    : outcome;
};

/** Sets or changes the Workspace's name (AC-29). */
export const useRenameWorkspace = (): RenameWorkspace => {
  const [renameWorkspace] = useRenameWorkspaceMutation();

  return useCallback(
    async (input) =>
      nameValidationKey(
        await runWorkspaceMutation(
          'renameWorkspace',
          renameWorkspace(input),
          (code) => fieldErrorsByCode[code],
        ),
      ),
    [renameWorkspace],
  );
};
