import type { RejectionReason } from '@warehouser/contracts/purchase-drafts';
import { useListRejectionReasonsQuery } from 'modules/purchase-draft/api/purchase-draft-api';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

/** The Rejection Reason catalogue (AC-06, AC-07), read the same way `usePackagingTypes` reads the
 * Packaging Type catalogue: whatever the actor's `PURCHASE_DRAFTS:WATCH` projection already admits.
 * Server data, not translated client copy — the team extends the catalogue, so a new Reason must
 * not require a client release (sad.md §5). */
export const useRejectionReasons = (): RejectionReason[] => {
  const warehouseId = useEnteredWarehouse();
  const { currentData } = useListRejectionReasonsQuery(warehouseId ?? '', {
    skip: warehouseId === undefined,
  });

  return currentData ?? [];
};
