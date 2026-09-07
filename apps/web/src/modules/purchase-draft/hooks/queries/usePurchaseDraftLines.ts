import { useListPurchaseDraftLinesQuery } from 'modules/purchase-draft/api/purchase-draft-api';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type {
  PurchaseDraftLineListEntry,
  PurchaseDraftState,
} from '@warehouser/contracts/purchase-drafts';

export type PurchaseDraftLinesReading = {
  entries: PurchaseDraftLineListEntry[];
  isError: boolean;
  isPending: boolean;
};

/**
 * The Warehouse's Purchase Draft Lines with their Delivery Modes, for the
 * by-line view AC-22 describes (T23).
 *
 * It reports its own readiness, unlike `usePurchaseDrafts` beside it, because
 * the route loader does **not** await this read: the by-line view is a
 * presentation the member switches into rather than the destination's first
 * paint, so the read starts when they ask for it and the surface owns the
 * waiting window (`frontend-architecture.md` §Route).
 *
 * The read is keyed by the **entered** Warehouse and skipped until one is
 * resolved, so a line never crosses the Warehouse boundary in cache and
 * switching Warehouse refetches rather than reusing the previous answer.
 */
export const usePurchaseDraftLines = (
  state: PurchaseDraftState,
): PurchaseDraftLinesReading => {
  const warehouseId = useEnteredWarehouse();
  const { currentData, isError } = useListPurchaseDraftLinesQuery(
    { warehouseId: warehouseId ?? '', state },
    { skip: warehouseId === undefined },
  );

  return {
    entries: currentData ?? [],
    isError,
    isPending: currentData === undefined && !isError,
  };
};
