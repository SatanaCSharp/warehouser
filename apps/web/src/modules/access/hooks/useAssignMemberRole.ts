import { useCallback } from 'react';

import { useAssignAccessMemberRoleMutation } from 'modules/access/api/access-api';
import { runAccessMutation } from 'modules/access/api/access-mutation';

import type { MutationOutcome } from 'modules/access/types/access.types';

export type AssignMemberRole = (
  userId: string,
  roleId: string,
) => Promise<MutationOutcome>;

/** Moves one member to another Role, within the named Warehouse (AC-05). */
export const useAssignMemberRole = (warehouseId: string): AssignMemberRole => {
  const [assignRole] = useAssignAccessMemberRoleMutation();

  return useCallback(
    (userId, roleId) =>
      runAccessMutation(
        'assignRole',
        assignRole({ warehouseId, userId, input: { roleId } }),
      ),
    [assignRole, warehouseId],
  );
};
