import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { purchaseDraftApi } from 'modules/purchase-draft/api/purchase-draft-api';
import { loadPurchaseDrafts } from 'modules/purchase-draft/loaders/purchase-draft.loader';
import { accessIds, authenticatedStore } from 'test/access-fixtures';

import type { PurchaseDraftLoaderContext } from 'modules/purchase-draft/loaders/purchase-draft.loader';
import type { AppStore } from 'store';

// T20 — the Purchase drafts destination's route loader (DoD "a test proves a
// loader refused by a missing PURCHASE_DRAFTS:WATCH issues zero requests").
// Colocated with the loader it covers (`placing-web-tests.md` §1), mirroring
// `modules/item/loaders/item.loader.spec.ts`'s refused-verdict and
// import-boundary cases for this destination's own dataset.

const LOADER_SOURCE = posix.join(
  posix.dirname(fileURLToPath(import.meta.url)),
  'purchase-draft.loader.ts',
);

const PURCHASE_DRAFTS_URL = `/api/v1/warehouses/${accessIds.warehouse}/purchase-drafts`;

const enteredContext = (store: AppStore): PurchaseDraftLoaderContext => ({
  status: 'entered',
  store,
  warehouseId: accessIds.warehouse,
});

const refusedContext = (store: AppStore): PurchaseDraftLoaderContext => ({
  reason: 'not-a-member',
  status: 'refused',
  store,
  warehouseId: accessIds.warehouse,
});

// AC-23 — the verdict `warehouseRoute.beforeLoad` now publishes for a
// membership in an ARCHIVED Warehouse. It is an entry, not a refusal: the
// destination reads on exactly the terms that applied before archiving.
const readOnlyContext = (store: AppStore): PurchaseDraftLoaderContext => ({
  reason: 'archived',
  status: 'entered-read-only',
  store,
  warehouseId: accessIds.warehouse,
});

const stubPurchaseDraftsServer = (
  permissionIds: readonly PermissionId[],
): string[] => {
  const requestedUrls: string[] = [];
  const CURRENT_URL = `/api/v1/warehouses/${accessIds.warehouse}/access/current`;

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      requestedUrls.push(url);
      if (url === CURRENT_URL) {
        return Promise.resolve(
          Response.json({
            warehouseId: accessIds.warehouse,
            roleId: accessIds.managerRole,
            roleKind: 'warehouse_manager',
            permissionIds,
            archivedAt: null,
          }),
        );
      }
      if (url.startsWith(PURCHASE_DRAFTS_URL)) {
        return Promise.resolve(Response.json([]));
      }
      return Promise.resolve(Response.json({}, { status: 404 }));
    }),
  );

  return requestedUrls;
};

describe('loadPurchaseDrafts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('issues no request at all when the Warehouse entry verdict is refused', async () => {
    const requestedUrls = stubPurchaseDraftsServer(Object.values(PermissionId));
    const store = authenticatedStore();

    await loadPurchaseDrafts({ context: refusedContext(store) });

    expect(requestedUrls).toStrictEqual([]);
    expect(store.getState().api.queries).toStrictEqual({});
  });

  // AC-23 — an archived Warehouse authorizes no operation that changes what it
  // holds, and its reads are unaffected: a member holding PURCHASE_DRAFTS:WATCH reads
  // exactly as before archiving. The old behaviour treated `archived` as a
  // refusal, which made the destination unreachable rather than read-only.
  it('requests the Purchase Drafts under a read-only verdict for an archived Warehouse', async () => {
    const requestedUrls = stubPurchaseDraftsServer([
      PermissionId.PURCHASE_DRAFTS_WATCH,
    ]);
    const store = authenticatedStore();

    await loadPurchaseDrafts({ context: readOnlyContext(store) });

    expect(requestedUrls).toContain(PURCHASE_DRAFTS_URL);
  });

  // AC-23's other half — the watch Permission still decides, so a member
  // without it is refused the read exactly as before archiving.
  it('issues no Purchase Drafts request under a read-only verdict when the actor holds no PURCHASE_DRAFTS:WATCH', async () => {
    const requestedUrls = stubPurchaseDraftsServer(
      Object.values(PermissionId).filter(
        (permission) => permission !== PermissionId.PURCHASE_DRAFTS_WATCH,
      ),
    );
    const store = authenticatedStore();

    await loadPurchaseDrafts({ context: readOnlyContext(store) });

    expect(requestedUrls).not.toContain(PURCHASE_DRAFTS_URL);
  });

  it('issues no purchase-drafts request when the actor holds no PURCHASE_DRAFTS:WATCH', async () => {
    const requestedUrls = stubPurchaseDraftsServer(
      Object.values(PermissionId).filter(
        (permission) => permission !== PermissionId.PURCHASE_DRAFTS_WATCH,
      ),
    );
    const store = authenticatedStore();

    await loadPurchaseDrafts({ context: enteredContext(store) });

    expect(
      requestedUrls.some((url) => url.startsWith(PURCHASE_DRAFTS_URL)),
    ).toBe(false);
  });

  it('requests the Warehouse Purchase Drafts when the actor holds PURCHASE_DRAFTS:WATCH', async () => {
    const requestedUrls = stubPurchaseDraftsServer([
      PermissionId.PURCHASE_DRAFTS_WATCH,
    ]);
    const store = authenticatedStore();

    await loadPurchaseDrafts({ context: enteredContext(store) });

    expect(
      requestedUrls.some((url) => url.startsWith(PURCHASE_DRAFTS_URL)),
    ).toBe(true);
  });

  it('dispatches its own read with subscribe: false (sad.md §4.4)', async () => {
    stubPurchaseDraftsServer([PermissionId.PURCHASE_DRAFTS_WATCH]);
    const store = authenticatedStore();
    const initiate = vi.spyOn(
      purchaseDraftApi.endpoints.listPurchaseDrafts,
      'initiate',
    );

    await loadPurchaseDrafts({ context: enteredContext(store) });

    expect(initiate).toHaveBeenCalledTimes(1);
    expect(initiate).toHaveBeenCalledWith(
      { warehouseId: accessIds.warehouse },
      { subscribe: false },
    );
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
