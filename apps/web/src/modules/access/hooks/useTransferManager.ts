import { useCallback } from 'react';

import { useTransferWarehouseManagerMutation } from 'modules/access/api/access-api';
import { runAccessMutation } from 'modules/access/api/access-mutation';

import type { MutationOutcome } from 'shared/api/mutation-outcome';

export type TransferManager = (
  recipientUserId: string,
  formerManagerRoleId: string,
) => Promise<MutationOutcome>;

/**
 * Hands the Warehouse Manager role to another member of the named Warehouse,
 * demoting the actor. Stays available on an archived Warehouse because its
 * subject is a membership edge, not a resource the Warehouse owns (AC-36,
 * ADR 0003).
 */
export const useTransferManager = (warehouseId: string): TransferManager => {
  const [transferManager] = useTransferWarehouseManagerMutation();

  return useCallback(
    (recipientUserId, formerManagerRoleId) =>
      runAccessMutation(
        'transferManager',
        transferManager({
          warehouseId,
          input: { recipientUserId, formerManagerRoleId },
        }),
      ),
    [transferManager, warehouseId],
  );
};
