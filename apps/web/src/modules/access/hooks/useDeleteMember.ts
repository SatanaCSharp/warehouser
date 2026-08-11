import { useCallback } from 'react';

import { useDeleteMemberMutation } from 'modules/access/api/access-api';
import { runAccessMutation } from 'modules/access/api/access-mutation';

import type { MutationOutcome } from 'modules/access/types/access.types';

export type DeleteMember = (userId: string) => Promise<MutationOutcome>;

/** Removes one member from the Warehouse permanently. */
export const useDeleteMember = (): DeleteMember => {
  const [deleteMember] = useDeleteMemberMutation();

  return useCallback(
    (userId) => runAccessMutation('deleteMember', deleteMember(userId)),
    [deleteMember],
  );
};
