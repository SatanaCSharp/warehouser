import type {
  ArrivalTimingPanel,
  CoverageGapPanel,
  PurchasingPipelinePanel,
  ReasonConcentrationPanel,
} from '@warehouser/contracts/dashboards';
import {
  arrivalTimingPanelSchema,
  coverageGapPanelSchema,
  purchasingPipelinePanelSchema,
  reasonConcentrationPanelSchema,
} from '@warehouser/contracts/dashboards';
import { api } from 'shared/api/client/api-client';
import { warehousePath } from 'shared/api/warehouse/warehouse-path';

/**
 * The four Warehouse Panel addresses `WarehouseDashboardController` serves,
 * built through the one place a Warehouse-scoped path is assembled so no read
 * can address a Warehouse without naming it (AC-05).
 */
const panelPath = (warehouseId: string, panel: string): string =>
  warehousePath(warehouseId, `dashboard/${panel}`);

/**
 * AC-26 — **freshness is refetch on entering, and nothing else.** No mutation
 * across `customer-orders`, `items`, `purchase-drafts` or `arrival-inspection`
 * knows these reads exist, so a cache tag would have to be remembered at every
 * one of those write sites; a forgotten one fails silently and presents a
 * figure from before the change the member just made, which `spec.md` §7 names
 * the most expensive failure this feature can have (sad.md §8 "Freshness").
 *
 * Declaring it on the endpoint rather than on the dispatch is what makes it
 * unconditional: every initiation of a Panel read re-reads, so a caller cannot
 * enter the Dashboard and be served a superseded body by forgetting an option.
 * The only initiator is `loaders/warehouse-dashboard.loader.ts`, so "on every
 * initiation" **is** "on entry" — the destination itself subscribes to none of
 * these endpoints and reads the bodies the loader already awaited, which is
 * also what keeps the read count after paint at zero (`spec.md` §6 read shape).
 */
const reReadOnEveryEntry = (): boolean => true;

export const warehouseDashboardApi = api.injectEndpoints({
  endpoints: (build) => ({
    readCoverageGap: build.query<CoverageGapPanel, string>({
      query: (warehouseId) => panelPath(warehouseId, 'coverage-gap'),
      extraOptions: { schema: coverageGapPanelSchema },
      forceRefetch: reReadOnEveryEntry,
    }),
    readReasonConcentration: build.query<ReasonConcentrationPanel, string>({
      query: (warehouseId) => panelPath(warehouseId, 'reason-concentration'),
      extraOptions: { schema: reasonConcentrationPanelSchema },
      forceRefetch: reReadOnEveryEntry,
    }),
    readArrivalTiming: build.query<ArrivalTimingPanel, string>({
      query: (warehouseId) => panelPath(warehouseId, 'arrival-timing'),
      extraOptions: { schema: arrivalTimingPanelSchema },
      forceRefetch: reReadOnEveryEntry,
    }),
    readPurchasingPipeline: build.query<PurchasingPipelinePanel, string>({
      query: (warehouseId) => panelPath(warehouseId, 'purchasing-pipeline'),
      extraOptions: { schema: purchasingPipelinePanelSchema },
      forceRefetch: reReadOnEveryEntry,
    }),
  }),
  overrideExisting: false,
});
