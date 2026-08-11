import { useCallback } from 'react';

import {
  useCreateAccessRoleMutation,
  useUpdateAccessRoleMutation,
} from 'modules/access/api/access-api';
import { runAccessMutation } from 'modules/access/api/access-mutation';

import type { RoleWrite } from '@warehouser/contracts/access';
import type { MutationOutcome } from 'modules/access/types/access.types';

export type SaveRole = (
  input: RoleWrite,
  roleId?: string,
) => Promise<MutationOutcome>;

/** Creates a Role, or updates the one named by `roleId`. */
export const useSaveRole = (): SaveRole => {
  const [createRole] = useCreateAccessRoleMutation();
  const [updateRole] = useUpdateAccessRoleMutation();

  return useCallback(
    (input, roleId) =>
      runAccessMutation(
        roleId ? 'updateRole' : 'createRole',
        roleId ? updateRole({ roleId, input }) : createRole(input),
      ),
    [createRole, updateRole],
  );
};
