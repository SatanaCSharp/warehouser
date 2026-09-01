import { useGetPurchaseDraftQuery } from 'modules/purchase-draft/api/purchase-draft-api';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type { PurchaseDraftDetail } from '@warehouser/contracts/purchase-drafts';

/** What the detail pane needs to know about the read behind it. */
export type PurchaseDraftReading = {
  /** The draft, once its own projection has arrived for the selected id. */
  draft: PurchaseDraftDetail | undefined;
  /** Whether that read failed, which is not the same as not having arrived. */
  isError: boolean;
};

/**
 * One Purchase Draft's full detail, including its lines, links and per-link
 * Drift Signal detail (contracts/openapi.yaml `PurchaseDraftDetail`). Reads
 * the same cached projection the list already primed for the selected draft;
 * `purchaseDraftId === undefined` (nothing selected yet) skips the request.
 *
 * It reports the **reading**, not just the draft. `currentData` is scoped to
 * the current argument, so it is `undefined` both while the newly selected
 * draft's projection is in flight and forever after a failed read — two states
 * a member has to be told apart, and neither of them is "nothing is selected".
 * Handing back only the draft is what let the pane tell a member who had just
 * selected one to select one (`writing-web-components.md` §6).
 */
export const usePurchaseDraft = (
  purchaseDraftId: string | undefined,
): PurchaseDraftReading => {
  const warehouseId = useEnteredWarehouse();
  const { currentData, isError } = useGetPurchaseDraftQuery(
    { warehouseId: warehouseId ?? '', purchaseDraftId: purchaseDraftId ?? '' },
    { skip: warehouseId === undefined || purchaseDraftId === undefined },
  );

  return { draft: currentData, isError };
};
