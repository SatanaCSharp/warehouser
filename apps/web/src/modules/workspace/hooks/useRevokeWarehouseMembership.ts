import { useCallback } from 'react';

import { runWorkspaceMutation } from 'modules/workspace/api/workspace-mutation';
import { useRevokeWarehouseMembershipMutation } from 'modules/workspace/api/workspace-warehouses-api';

import type { MutationOutcome } from 'modules/workspace/types/workspace.types';

export type RevokeWarehouseMembership = (
  warehouseId: string,
  warehouseName: string,
  userId: string,
) => Promise<MutationOutcome>;

/**
 * Withdraws a User's membership in a Warehouse (AC-25b). The server refuses
 * the protected Warehouse Manager's row and the actor's own row (AC-25c)
 * independently of whichever capability offered the control; a refusal comes
 * back as a normal API failure that the shared error toast already reports.
 */
export const useRevokeWarehouseMembership = (): RevokeWarehouseMembership => {
  const [revokeWarehouseMembership] = useRevokeWarehouseMembershipMutation();

  return useCallback(
    (warehouseId, warehouseName, userId) =>
      runWorkspaceMutation(
        'withdrawWarehouseAccess',
        revokeWarehouseMembership({ warehouseId, userId }),
        undefined,
        { name: warehouseName },
      ),
    [revokeWarehouseMembership],
  );
};
