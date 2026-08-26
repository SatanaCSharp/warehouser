import { useListPurchaseDraftsQuery } from 'modules/purchase-draft/api/purchase-draft-api';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type { PurchaseDraftSummary } from '@warehouser/contracts/purchase-drafts';

/**
 * The Warehouse's Purchase Draft summaries, loaded for whoever asks (T20).
 * The gate is `PURCHASE_DRAFTS:WATCH`, applied by `loaders/purchase-draft.loader.ts`;
 * this hook reads whatever the loader already committed rather than
 * re-deciding access, so it reports no readiness of its own
 * (`frontend-architecture.md` §Page).
 */
export const usePurchaseDrafts = (): PurchaseDraftSummary[] => {
  const warehouseId = useEnteredWarehouse();
  const { currentData } = useListPurchaseDraftsQuery(
    { warehouseId: warehouseId ?? '' },
    { skip: warehouseId === undefined },
  );

  return currentData ?? [];
};
