import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PermissionId } from '@warehouser/shared-types/enums';
import { itemApi } from 'modules/item/api/item-api';
import type { ItemLoaderContext } from 'modules/item/loaders/item.loader';
import { loadItems } from 'modules/item/loaders/item.loader';
import type { AppStore } from 'store';
import { accessIds, authenticatedStore } from 'test/access-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';

// T18 — the Items destination's route loader (DoD "a test proves a loader
// refused by a missing ITEMS:WATCH issues zero requests"). Colocated with the
// loader it covers (`placing-web-tests.md` §1), mirroring
// `modules/access/loaders/access-surface.loader.spec.ts`'s refused-verdict and
// import-boundary cases for the single dataset this destination owns.

const LOADER_SOURCE = posix.join(
  posix.dirname(fileURLToPath(import.meta.url)),
  'item.loader.ts',
);

const ITEMS_URL = `/api/v1/warehouses/${accessIds.warehouse}/items`;

const enteredContext = (store: AppStore): ItemLoaderContext => ({
  status: 'entered',
  store,
  warehouseId: accessIds.warehouse,
});

const refusedContext = (store: AppStore): ItemLoaderContext => ({
  reason: 'not-a-member',
  status: 'refused',
  store,
  warehouseId: accessIds.warehouse,
});

// AC-23 — the verdict `warehouseRoute.beforeLoad` now publishes for a
// membership in an ARCHIVED Warehouse. It is an entry, not a refusal: the
// destination reads on exactly the terms that applied before archiving.
const readOnlyContext = (store: AppStore): ItemLoaderContext => ({
  reason: 'archived',
  status: 'entered-read-only',
  store,
  warehouseId: accessIds.warehouse,
});

const stubItemsServer = (permissionIds: readonly PermissionId[]): string[] => {
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
      if (url === ITEMS_URL) {
        return Promise.resolve(Response.json([]));
      }
      return Promise.resolve(Response.json({}, { status: 404 }));
    }),
  );

  return requestedUrls;
};

describe('loadItems', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('issues no request at all when the Warehouse entry verdict is refused', async () => {
    const requestedUrls = stubItemsServer(Object.values(PermissionId));
    const store = authenticatedStore();

    await loadItems({ context: refusedContext(store) });

    expect(requestedUrls).toStrictEqual([]);
    expect(store.getState().api.queries).toStrictEqual({});
  });

  // AC-23 — an archived Warehouse authorizes no operation that changes what it
  // holds, and its reads are unaffected: a member holding ITEMS:WATCH reads
  // exactly as before archiving. The old behaviour treated `archived` as a
  // refusal, which made the destination unreachable rather than read-only.
  it('requests the Items under a read-only verdict for an archived Warehouse', async () => {
    const requestedUrls = stubItemsServer([PermissionId.ITEMS_WATCH]);
    const store = authenticatedStore();

    await loadItems({ context: readOnlyContext(store) });

    expect(requestedUrls).toContain(ITEMS_URL);
  });

  // AC-23's other half — the watch Permission still decides, so a member
  // without it is refused the read exactly as before archiving.
  it('issues no Items request under a read-only verdict when the actor holds no ITEMS:WATCH', async () => {
    const requestedUrls = stubItemsServer(
      Object.values(PermissionId).filter(
        (permission) => permission !== PermissionId.ITEMS_WATCH,
      ),
    );
    const store = authenticatedStore();

    await loadItems({ context: readOnlyContext(store) });

    expect(requestedUrls).not.toContain(ITEMS_URL);
  });

  it('issues no items request when the actor holds no ITEMS:WATCH', async () => {
    const requestedUrls = stubItemsServer(
      Object.values(PermissionId).filter(
        (permission) => permission !== PermissionId.ITEMS_WATCH,
      ),
    );
    const store = authenticatedStore();

    await loadItems({ context: enteredContext(store) });

    expect(requestedUrls).not.toContain(ITEMS_URL);
  });

  it('requests the Warehouse Items when the actor holds ITEMS:WATCH', async () => {
    const requestedUrls = stubItemsServer([PermissionId.ITEMS_WATCH]);
    const store = authenticatedStore();

    await loadItems({ context: enteredContext(store) });

    expect(requestedUrls).toContain(ITEMS_URL);
  });

  it('dispatches its own read with subscribe: false (sad.md §4.4)', async () => {
    stubItemsServer([PermissionId.ITEMS_WATCH]);
    const store = authenticatedStore();
    const initiate = vi.spyOn(itemApi.endpoints.listItems, 'initiate');

    await loadItems({ context: enteredContext(store) });

    expect(initiate).toHaveBeenCalledTimes(1);
    expect(initiate).toHaveBeenCalledWith(accessIds.warehouse, {
      subscribe: false,
    });
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
