import { useCallback } from 'react';

import { useTransferWarehouseManagerMutation } from 'modules/access/api/access-api';
import { runAccessMutation } from 'modules/access/api/access-mutation';

import type { MutationOutcome } from 'modules/access/types/access.types';

export type TransferManager = (
  recipientUserId: string,
  formerManagerRoleId: string,
) => Promise<MutationOutcome>;

/** Hands the Warehouse Manager role to another member, demoting the actor. */
export const useTransferManager = (): TransferManager => {
  const [transferManager] = useTransferWarehouseManagerMutation();

  return useCallback(
    (recipientUserId, formerManagerRoleId) =>
      runAccessMutation(
        'transferManager',
        transferManager({ recipientUserId, formerManagerRoleId }),
      ),
    [transferManager],
  );
};
