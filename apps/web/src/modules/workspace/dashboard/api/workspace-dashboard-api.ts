import type {
  DemandPressurePanel,
  OrderFlowPanel,
  PurchasingSpreadPanel,
  ReceiptReliabilityPanel,
} from '@warehouser/contracts/dashboards';
import {
  demandPressurePanelSchema,
  orderFlowPanelSchema,
  purchasingSpreadPanelSchema,
  receiptReliabilityPanelSchema,
} from '@warehouser/contracts/dashboards';
import { api } from 'shared/api/client/api-client';

/**
 * The four Workspace Panel addresses `WorkspaceDashboardController` serves.
 *
 * **No address names a Workspace**, in a path, a query or a body position:
 * `WorkspaceAccessGuard` derives the acting user's Workspace entirely from the
 * session, so there is no identifier for a read to offer and none for a
 * caller to get wrong (AC-22).
 */
const WORKSPACE_DASHBOARD_PATH = '/api/v1/workspace/dashboard';

const panelPath = (panel: string): string =>
  `${WORKSPACE_DASHBOARD_PATH}/${panel}`;

/**
 * AC-26 (freshness is refetch on entering) is declared on the loader's
 * dispatch — `loaders/workspace-dashboard.loader.ts` — rather than here. An
 * endpoint-level `forceRefetch` fires on every initiation of the endpoint,
 * including the destination's own subscription, and the destination must
 * subscribe or RTK Query collects the loader-filled entry 60 s later. Declared
 * here it issued two reads per Panel on entry, against `spec.md` §6.
 *
 * The superseded note follows, kept for its reasoning about why a cache tag is
 * not the mechanism:
 *
 * AC-26 — **freshness is refetch on entering, and nothing else.** No mutation
 * across `customer-orders`, `purchase-drafts` or `arrival-inspection` knows
 * these reads exist, so a cache tag would have to be remembered at every one
 * of those write sites; a forgotten one fails silently and presents a figure
 * from before the change the member just made, which `spec.md` §7 names the
 * most expensive failure this feature can have (sad.md §8 "Freshness").
 *
 * Declaring it on the endpoint rather than on the dispatch is what makes it
 * unconditional: every initiation of a Panel read re-reads, so a caller cannot
 * enter the Dashboard and be served a superseded body by forgetting an option.
 * The only initiator is `loaders/workspace-dashboard.loader.ts`, so "on every
 * initiation" **is** "on entry" — the destination itself subscribes to none of
 * these endpoints and reads the bodies the loader already awaited, which is
 * also what keeps the read count after paint at zero (`spec.md` §6 read shape).
 */

export const workspaceDashboardApi = api.injectEndpoints({
  endpoints: (build) => ({
    readDemandPressure: build.query<DemandPressurePanel, void>({
      query: () => panelPath('demand-pressure'),
      extraOptions: { schema: demandPressurePanelSchema },
    }),
    readOrderFlow: build.query<OrderFlowPanel, void>({
      query: () => panelPath('order-flow'),
      extraOptions: { schema: orderFlowPanelSchema },
    }),
    readPurchasingSpread: build.query<PurchasingSpreadPanel, void>({
      query: () => panelPath('purchasing-spread'),
      extraOptions: { schema: purchasingSpreadPanelSchema },
    }),
    readReceiptReliability: build.query<ReceiptReliabilityPanel, void>({
      query: () => panelPath('receipt-reliability'),
      extraOptions: { schema: receiptReliabilityPanelSchema },
    }),
  }),
  overrideExisting: false,
});
