import { useCallback } from 'react';

import { useAddWorkspaceMemberMutation } from 'modules/workspace/api/workspace-members-api';
import { runWorkspaceMutation } from 'shared/api/workspace-mutation';

import type { WorkspaceMemberAdd } from '@warehouser/contracts/workspaces';
import type { MutationOutcome } from 'shared/api/mutation-outcome';

export type AddWorkspaceMember = (
  member: WorkspaceMemberAdd,
) => Promise<MutationOutcome>;

/**
 * Makes a User of this Workspace a Workspace Member holding exactly one custom
 * Workspace Role (AC-19). Whether the candidate may be added at all is the
 * server's decision (AC-20); this only reports the outcome.
 */
export const useAddWorkspaceMember = (): AddWorkspaceMember => {
  const [addWorkspaceMember] = useAddWorkspaceMemberMutation();

  return useCallback(
    (member) =>
      runWorkspaceMutation('addWorkspaceMember', addWorkspaceMember(member)),
    [addWorkspaceMember],
  );
};
