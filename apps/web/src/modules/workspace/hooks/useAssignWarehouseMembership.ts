import { useCallback } from 'react';

import { useAssignWarehouseMembershipMutation } from 'modules/workspace/api/workspace-warehouses-api';
import { runWorkspaceMutation } from 'shared/api/workspace-mutation';

import type { WarehouseMembershipAssignment } from '@warehouser/contracts/workspaces';
import type { MutationOutcome } from 'shared/api/mutation-outcome';

export type AssignWarehouseMembership = (
  warehouseId: string,
  warehouseName: string,
  input: WarehouseMembershipAssignment,
) => Promise<MutationOutcome>;

/**
 * Gives a User of the Workspace a membership and Role in a Warehouse (AC-23).
 * `warehouseName` interpolates the committed Warehouse into the toast, so the
 * outcome names what changed rather than only naming the action.
 */
export const useAssignWarehouseMembership = (): AssignWarehouseMembership => {
  const [assignWarehouseMembership] = useAssignWarehouseMembershipMutation();

  return useCallback(
    (warehouseId, warehouseName, input) =>
      runWorkspaceMutation(
        'giveWarehouseAccess',
        assignWarehouseMembership({ warehouseId, ...input }),
        undefined,
        { name: warehouseName },
      ),
    [assignWarehouseMembership],
  );
};
