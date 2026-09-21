import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QueryStatus } from '@reduxjs/toolkit/query';
import { PermissionId } from '@warehouser/shared-types/enums';
import { warehouseDashboardApi } from 'modules/warehouse/api/warehouse-dashboard-api';
import type { WarehouseDashboardLoaderContext } from 'modules/warehouse/loaders/warehouse-dashboard.loader';
import { loadWarehouseDashboard } from 'modules/warehouse/loaders/warehouse-dashboard.loader';
import type { AppStore } from 'store';
import { accessIds, authenticatedStore } from 'test/access-fixtures';
import {
  amendedCoverageGapPanel,
  ARRIVAL_TIMING_URL,
  COVERAGE_GAP_URL,
  CURRENT_ACCESS_URL,
  panelPermissions,
  PURCHASING_PIPELINE_URL,
  REASON_CONCENTRATION_URL,
  stubDashboardServer,
} from 'test/dashboard-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';

// T16 — the Warehouse Dashboard's route loader (sad.md §6.1). Colocated with
// the loader it covers (`placing-web-tests.md` §1), mirroring
// `modules/item/loaders/item.loader.spec.ts`.
//
// The DoD this file carries: exactly the permitted reads are dispatched at one,
// three and four Panels; **nothing at all** is issued on a refused verdict
// (AC-02); an archived Warehouse reads on exactly the pre-archiving terms
// (AC-23); and entering again refetches rather than serving a superseded figure
// (AC-26).

const LOADER_SOURCE = posix.join(
  posix.dirname(fileURLToPath(import.meta.url)),
  'warehouse-dashboard.loader.ts',
);

const API_SOURCE = posix.join(
  posix.dirname(posix.dirname(fileURLToPath(import.meta.url))),
  'api',
  'warehouse-dashboard-api.ts',
);

const PANEL_URLS = [
  COVERAGE_GAP_URL,
  ARRIVAL_TIMING_URL,
  PURCHASING_PIPELINE_URL,
  REASON_CONCENTRATION_URL,
];

const enteredContext = (store: AppStore): WarehouseDashboardLoaderContext => ({
  status: 'entered',
  store,
  warehouseId: accessIds.warehouse,
});

const refusedContext = (store: AppStore): WarehouseDashboardLoaderContext => ({
  reason: 'not-a-member',
  status: 'refused',
  store,
  warehouseId: accessIds.warehouse,
});

/** AC-23 — an archived Warehouse is entered read-only, and still read. */
const readOnlyContext = (store: AppStore): WarehouseDashboardLoaderContext => ({
  reason: 'archived',
  status: 'entered-read-only',
  store,
  warehouseId: accessIds.warehouse,
});

const panelsRequested = (requestedUrls: readonly string[]): string[] =>
  PANEL_URLS.filter((url) => requestedUrls.includes(url));

describe('loadWarehouseDashboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // AC-02 — the loader is reached on an address the actor was just refused,
  // because `warehouseRoute.beforeLoad` returns a verdict rather than throwing.
  // A refusal must therefore cost zero requests: not the projection, and not a
  // single Panel.
  it('issues nothing at all when the Warehouse entry verdict is refused', async () => {
    const requestedUrls = stubDashboardServer();
    const store = authenticatedStore();

    await loadWarehouseDashboard({ context: refusedContext(store) });

    expect(requestedUrls).toStrictEqual([]);
    expect(store.getState().api.queries).toStrictEqual({});
  });

  // AC-02 — a member holding some watch Permissions but no Panel's whole set
  // reaches the denial, and the loader issues no Panel read on the way there.
  // ITEMS:WATCH alone admits nothing: Coverage Gap also needs Customer Orders
  // and Purchase Drafts (`spec.md` §6.1 Panel table).
  it('issues no Panel read when the actor holds no Panel whole set', async () => {
    const requestedUrls = stubDashboardServer({
      permissionIds: [PermissionId.ITEMS_WATCH],
    });
    const store = authenticatedStore();

    await loadWarehouseDashboard({ context: enteredContext(store) });

    expect(requestedUrls).toContain(CURRENT_ACCESS_URL);
    expect(panelsRequested(requestedUrls)).toStrictEqual([]);
  });

  // AC-02a — PURCHASE_DRAFTS:WATCH alone admits the Purchasing Pipeline and
  // nothing else, so exactly one Panel read is issued.
  it('requests the Purchasing Pipeline alone for a Purchase-Drafts-only member', async () => {
    const requestedUrls = stubDashboardServer({
      permissionIds: panelPermissions.purchasingPipeline,
    });
    const store = authenticatedStore();

    await loadWarehouseDashboard({ context: enteredContext(store) });

    expect(panelsRequested(requestedUrls)).toStrictEqual([
      PURCHASING_PIPELINE_URL,
    ]);
  });

  // AC-13 — without REJECTIONS:WATCH the other three are read and Reason
  // Concentration is not requested at all.
  it('requests three Panels and not Reason Concentration without REJECTIONS:WATCH', async () => {
    const requestedUrls = stubDashboardServer({
      permissionIds: [
        PermissionId.CUSTOMER_ORDERS_WATCH,
        PermissionId.ITEMS_WATCH,
        PermissionId.PURCHASE_DRAFTS_WATCH,
      ],
    });
    const store = authenticatedStore();

    await loadWarehouseDashboard({ context: enteredContext(store) });

    expect(panelsRequested(requestedUrls)).toStrictEqual([
      COVERAGE_GAP_URL,
      ARRIVAL_TIMING_URL,
      PURCHASING_PIPELINE_URL,
    ]);
    expect(requestedUrls).not.toContain(REASON_CONCENTRATION_URL);
  });

  // AC-01 — every watch Permission admits all four, each awaited, so the page
  // mounts with every permitted figure present (`spec.md` §6 read shape).
  it('requests all four Panels for a member holding every watch Permission', async () => {
    const requestedUrls = stubDashboardServer();
    const store = authenticatedStore();

    await loadWarehouseDashboard({ context: enteredContext(store) });

    expect(panelsRequested(requestedUrls)).toStrictEqual(PANEL_URLS);
    expect(
      Object.values(store.getState().api.queries).filter(
        (entry) => entry?.status === QueryStatus.fulfilled,
      ),
    ).toHaveLength(PANEL_URLS.length + 1);
  });

  // AC-23 — the archived Warehouse changes no Permission term: the same four
  // reads are issued under the read-only verdict.
  it('requests every permitted Panel under the archived read-only verdict', async () => {
    const requestedUrls = stubDashboardServer({
      archivedAt: '2026-09-01T00:00:00.000Z',
    });
    const store = authenticatedStore();

    await loadWarehouseDashboard({ context: readOnlyContext(store) });

    expect(panelsRequested(requestedUrls)).toStrictEqual(PANEL_URLS);
  });

  it('dispatches every read with subscribe: false (sad.md §4.4)', async () => {
    stubDashboardServer();
    const store = authenticatedStore();
    const initiate = vi.spyOn(
      warehouseDashboardApi.endpoints.readCoverageGap,
      'initiate',
    );

    await loadWarehouseDashboard({ context: enteredContext(store) });

    expect(initiate).toHaveBeenCalledTimes(1);
    expect(initiate).toHaveBeenCalledWith(accessIds.warehouse, {
      subscribe: false,
    });
  });

  // AC-26 — freshness is refetch-on-entry. Nothing across `customer-orders`,
  // `items`, `purchase-drafts` or `arrival-inspection` invalidates these reads,
  // so a second entry that served the cached body would present a figure from
  // before the change the member just made — the failure `spec.md` §7 names the
  // most expensive this feature can have. The loader must therefore reissue.
  it('refetches on a second entry rather than serving the cached figure', async () => {
    stubDashboardServer();
    const store = authenticatedStore();
    await loadWarehouseDashboard({ context: enteredContext(store) });

    vi.unstubAllGlobals();
    const secondEntryUrls = stubDashboardServer({
      coverageGap: amendedCoverageGapPanel,
    });
    await loadWarehouseDashboard({ context: enteredContext(store) });

    expect(secondEntryUrls).toContain(COVERAGE_GAP_URL);
    expect(
      warehouseDashboardApi.endpoints.readCoverageGap.select(
        accessIds.warehouse,
      )(store.getState()).data,
    ).toStrictEqual(amendedCoverageGapPanel);
  });

  // AC-26's other half — no tag invalidation is used, because no mutation
  // anywhere knows these reads exist and a forgotten tag fails silently
  // (sad.md §8 "Freshness"). The endpoints therefore declare no tags at all;
  // asserting it on the source is what keeps a later `providesTags` from
  // quietly replacing the refetch above.
  it('declares no cache tags on any Warehouse Dashboard read', () => {
    const source = readFileSync(API_SOURCE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/^\s*\/\/.*$/gmu, '');

    expect(source).not.toMatch(/providesTags/u);
    expect(source).not.toMatch(/invalidatesTags/u);
  });

  it('imports no page module (ADR 0001 §Decision outcome)', () => {
    const source = readFileSync(LOADER_SOURCE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/^\s*\/\/.*$/gmu, '');
    const specifiers = [
      ...source.matchAll(
        /(?:from|import)\s*\(?\s*['"](?<specifier>[^'"]+)['"]/gu,
      ),
    ].map((match) => match.groups?.specifier ?? '');

    expect(specifiers.length).toBeGreaterThan(0);
    expect(
      specifiers.filter((specifier) => /(?:^|\/)page$/u.test(specifier)),
    ).toStrictEqual([]);
  });
});
