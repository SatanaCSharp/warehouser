import { useCallback } from 'react';

import { useDeleteAccessRoleMutation } from 'modules/access/api/access-api';
import { runAccessMutation } from 'modules/access/api/access-mutation';

import type { MutationOutcome } from 'shared/api/mutation-outcome';

export type DeleteRole = (
  roleId: string,
  replacementRoleId: string | null,
) => Promise<MutationOutcome>;

/**
 * Deletes a Role in the named Warehouse, moving its members to
 * `replacementRoleId` when it has any.
 */
export const useDeleteRole = (warehouseId: string): DeleteRole => {
  const [deleteRole] = useDeleteAccessRoleMutation();

  return useCallback(
    (roleId, replacementRoleId) =>
      runAccessMutation(
        'deleteRole',
        deleteRole({ warehouseId, roleId, input: { replacementRoleId } }),
      ),
    [deleteRole, warehouseId],
  );
};
