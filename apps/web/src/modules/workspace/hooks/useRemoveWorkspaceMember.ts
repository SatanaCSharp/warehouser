import { useCallback } from 'react';

import { useRemoveWorkspaceMemberMutation } from 'modules/workspace/api/workspace-members-api';
import { runWorkspaceMutation } from 'modules/workspace/api/workspace-mutation';

import type { MutationOutcome } from 'modules/workspace/types/workspace.types';

export type RemoveWorkspaceMember = (
  userId: string,
) => Promise<MutationOutcome>;

/**
 * Ends a Workspace membership. The target keeps every Warehouse membership and
 * Warehouse Role they hold and only stops administering the Workspace (AC-19a);
 * removing the Workspace Owner is refused by the server (AC-21a), which is why
 * the Owner row offers no such control at all.
 */
export const useRemoveWorkspaceMember = (): RemoveWorkspaceMember => {
  const [removeWorkspaceMember] = useRemoveWorkspaceMemberMutation();

  return useCallback(
    (userId) =>
      runWorkspaceMutation(
        'removeWorkspaceMember',
        removeWorkspaceMember(userId),
      ),
    [removeWorkspaceMember],
  );
};
