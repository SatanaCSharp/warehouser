import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { customerOrderApi } from 'modules/customer-order/api/customer-order-api';
import { loadDemand } from 'modules/customer-order/loaders/demand.loader';
import { accessIds, authenticatedStore } from 'test/access-fixtures';

import type { DemandLoaderContext } from 'modules/customer-order/loaders/demand.loader';
import type { AppStore } from 'store';

// T19 — the Demand destination's route loader (DoD "a test proves a loader
// refused by a missing CUSTOMER_ORDERS:WATCH issues zero requests"). Colocated
// with the loader it covers (`placing-web-tests.md` §1), mirroring
// `modules/item/loaders/item.loader.spec.ts`'s refused-verdict and
// import-boundary cases for this destination's single awaited dataset.

const LOADER_SOURCE = posix.join(
  posix.dirname(fileURLToPath(import.meta.url)),
  'demand.loader.ts',
);

const DEMAND_URL = `/api/v1/warehouses/${accessIds.warehouse}/demand`;

const enteredContext = (store: AppStore): DemandLoaderContext => ({
  status: 'entered',
  store,
  warehouseId: accessIds.warehouse,
});

const refusedContext = (
  store: AppStore,
  reason: 'archived' | 'not-a-member',
): DemandLoaderContext => ({
  reason,
  status: 'refused',
  store,
  warehouseId: accessIds.warehouse,
});

const stubDemandServer = (permissionIds: readonly PermissionId[]): string[] => {
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
      if (url === DEMAND_URL) {
        return Promise.resolve(Response.json([]));
      }
      return Promise.resolve(Response.json({}, { status: 404 }));
    }),
  );

  return requestedUrls;
};

describe('loadDemand', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([['not-a-member'], ['archived']] as const)(
    'issues no request at all when the Warehouse entry verdict is refused for %s',
    async (reason) => {
      const requestedUrls = stubDemandServer(Object.values(PermissionId));
      const store = authenticatedStore();

      await loadDemand({ context: refusedContext(store, reason) });

      expect(requestedUrls).toStrictEqual([]);
      expect(store.getState().api.queries).toStrictEqual({});
    },
  );

  it('issues no demand request when the actor holds no CUSTOMER_ORDERS:WATCH', async () => {
    const requestedUrls = stubDemandServer(
      Object.values(PermissionId).filter(
        (permission) => permission !== PermissionId.CUSTOMER_ORDERS_WATCH,
      ),
    );
    const store = authenticatedStore();

    await loadDemand({ context: enteredContext(store) });

    expect(requestedUrls).not.toContain(DEMAND_URL);
  });

  it('requests the consolidated demand when the actor holds CUSTOMER_ORDERS:WATCH', async () => {
    const requestedUrls = stubDemandServer([
      PermissionId.CUSTOMER_ORDERS_WATCH,
    ]);
    const store = authenticatedStore();

    await loadDemand({ context: enteredContext(store) });

    expect(requestedUrls).toContain(DEMAND_URL);
  });

  it('dispatches its own read with subscribe: false (sad.md §4.4)', async () => {
    stubDemandServer([PermissionId.CUSTOMER_ORDERS_WATCH]);
    const store = authenticatedStore();
    const initiate = vi.spyOn(
      customerOrderApi.endpoints.readDemand,
      'initiate',
    );

    await loadDemand({ context: enteredContext(store) });

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
