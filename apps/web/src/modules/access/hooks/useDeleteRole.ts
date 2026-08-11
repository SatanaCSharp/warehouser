import { useCallback } from 'react';

import { useDeleteAccessRoleMutation } from 'modules/access/api/access-api';
import { runAccessMutation } from 'modules/access/api/access-mutation';

import type { MutationOutcome } from 'modules/access/types/access.types';

export type DeleteRole = (
  roleId: string,
  replacementRoleId: string | null,
) => Promise<MutationOutcome>;

/** Deletes a Role, moving its members to `replacementRoleId` when it has any. */
export const useDeleteRole = (): DeleteRole => {
  const [deleteRole] = useDeleteAccessRoleMutation();

  return useCallback(
    (roleId, replacementRoleId) =>
      runAccessMutation(
        'deleteRole',
        deleteRole({ roleId, input: { replacementRoleId } }),
      ),
    [deleteRole],
  );
};
