import { useCallback } from 'react';

import { useAssignAccessMemberRoleMutation } from 'modules/access/api/access-api';
import { runAccessMutation } from 'modules/access/api/access-mutation';

import type { MutationOutcome } from 'modules/access/types/access.types';

export type AssignMemberRole = (
  userId: string,
  roleId: string,
) => Promise<MutationOutcome>;

/** Moves one member to another Role. */
export const useAssignMemberRole = (): AssignMemberRole => {
  const [assignRole] = useAssignAccessMemberRoleMutation();

  return useCallback(
    (userId, roleId) =>
      runAccessMutation(
        'assignRole',
        assignRole({ userId, input: { roleId } }),
      ),
    [assignRole],
  );
};
