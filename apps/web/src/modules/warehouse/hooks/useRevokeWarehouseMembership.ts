import { useCallback } from 'react';

import { useRevokeWarehouseMembershipMutation } from 'modules/warehouse/api/warehouse-api';
import { runWorkspaceMutation } from 'shared/api/workspace-mutation';

import type { MutationOutcome } from 'shared/api/mutation-outcome';

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
