import { useGetPurchaseDraftQuery } from 'modules/purchase-draft/api/purchase-draft-api';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type { PurchaseDraftDetail } from '@warehouser/contracts/purchase-drafts';

/**
 * One Purchase Draft's full detail, including its lines, links and per-link
 * Drift Signal detail (contracts/openapi.yaml `PurchaseDraftDetail`). Reads
 * the same cached projection the list already primed for the selected draft;
 * `purchaseDraftId === undefined` (nothing selected yet) skips the request.
 */
export const usePurchaseDraft = (
  purchaseDraftId: string | undefined,
): PurchaseDraftDetail | undefined => {
  const warehouseId = useEnteredWarehouse();
  const { currentData } = useGetPurchaseDraftQuery(
    { warehouseId: warehouseId ?? '', purchaseDraftId: purchaseDraftId ?? '' },
    { skip: warehouseId === undefined || purchaseDraftId === undefined },
  );

  return currentData;
};
