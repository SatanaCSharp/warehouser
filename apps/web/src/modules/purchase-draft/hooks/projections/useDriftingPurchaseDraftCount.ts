import { usePurchaseDrafts } from 'modules/purchase-draft/hooks/queries/usePurchaseDrafts';

/**
 * How many of the Warehouse's Purchase Drafts carry a Drift Signal (AC-16a).
 *
 * It reads the **same** `listPurchaseDrafts` projection the destination itself
 * reads rather than asking a second question: RTK Query deduplicates
 * subscriptions, so the sidebar badge and the drafts page share one request and
 * one cache entry, and a draft that stops drifting narrows both at once
 * (`writing-web-components.md` §4).
 */
export const useDriftingPurchaseDraftCount = (): number =>
  usePurchaseDrafts().filter((draft) => draft.hasDriftSignal).length;
