import { useCallback } from 'react';

import { useDeleteMemberMutation } from 'modules/access/api/access-api';
import { runAccessMutation } from 'modules/access/api/access-mutation';

import type { MutationOutcome } from 'shared/api/mutation-outcome';

export type DeleteMember = (userId: string) => Promise<MutationOutcome>;

/** Removes one member from the named Warehouse permanently. */
export const useDeleteMember = (warehouseId: string): DeleteMember => {
  const [deleteMember] = useDeleteMemberMutation();

  return useCallback(
    (userId) =>
      runAccessMutation('deleteMember', deleteMember({ warehouseId, userId })),
    [deleteMember, warehouseId],
  );
};
