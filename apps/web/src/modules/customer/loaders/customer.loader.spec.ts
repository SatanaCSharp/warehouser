import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PermissionId } from '@warehouser/shared-types/enums';
import { customerApi } from 'modules/customer/api/customer-api';
import type { CustomerLoaderContext } from 'modules/customer/loaders/customer.loader';
import { loadCustomers } from 'modules/customer/loaders/customer.loader';
import type { AppStore } from 'store';
import { accessIds, authenticatedStore } from 'test/access-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';

// delivery-addresses T21 — the Customers destination's route loader (DoD "its
// loader dispatches nothing without `CUSTOMERS:WATCH`", AC-09). Colocated with
// the loader it covers (`placing-web-tests.md` §1), mirroring
// `modules/item/loaders/item.loader.spec.ts` for the single dataset this
// destination owns.
//
// AC-09's clause is stronger than "the read is refused": the refused member
// must be told nothing, including how many Customers exist — so the assertion
// is a request COUNT of zero, not the absence of a rendered name.

const LOADER_SOURCE = posix.join(
  posix.dirname(fileURLToPath(import.meta.url)),
  'customer.loader.ts',
);

const CUSTOMERS_URL = `/api/v1/warehouses/${accessIds.warehouse}/customers`;
const CURRENT_URL = `/api/v1/warehouses/${accessIds.warehouse}/access/current`;

const enteredContext = (store: AppStore): CustomerLoaderContext => ({
  status: 'entered',
  store,
  warehouseId: accessIds.warehouse,
});

const refusedContext = (store: AppStore): CustomerLoaderContext => ({
  reason: 'not-a-member',
  status: 'refused',
  store,
  warehouseId: accessIds.warehouse,
});

// AC-23 — an archived Warehouse authorizes no operation that changes what it
// holds, and its reads are unaffected.
const readOnlyContext = (store: AppStore): CustomerLoaderContext => ({
  reason: 'archived',
  status: 'entered-read-only',
  store,
  warehouseId: accessIds.warehouse,
});

const stubCustomersServer = (
  permissionIds: readonly PermissionId[],
): string[] => {
  const requestedUrls: string[] = [];

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
      if (url === CUSTOMERS_URL) {
        return Promise.resolve(Response.json([]));
      }
      return Promise.resolve(Response.json({}, { status: 404 }));
    }),
  );

  return requestedUrls;
};

describe('loadCustomers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('issues no request at all when the Warehouse entry verdict is refused', async () => {
    const requestedUrls = stubCustomersServer(Object.values(PermissionId));
    const store = authenticatedStore();

    await loadCustomers({ context: refusedContext(store) });

    expect(requestedUrls).toStrictEqual([]);
    expect(store.getState().api.queries).toStrictEqual({});
  });

  // AC-09 — the refused member is told nothing at all, not even how many
  // Customers exist, so the Customers read is never issued.
  it('issues no Customers request when the actor holds no CUSTOMERS:WATCH', async () => {
    const requestedUrls = stubCustomersServer(
      Object.values(PermissionId).filter(
        (permission) => permission !== PermissionId.CUSTOMERS_WATCH,
      ),
    );
    const store = authenticatedStore();

    await loadCustomers({ context: enteredContext(store) });

    expect(requestedUrls).not.toContain(CUSTOMERS_URL);
  });

  it('requests the Warehouse Customers when the actor holds CUSTOMERS:WATCH', async () => {
    const requestedUrls = stubCustomersServer([PermissionId.CUSTOMERS_WATCH]);
    const store = authenticatedStore();

    await loadCustomers({ context: enteredContext(store) });

    expect(requestedUrls).toContain(CUSTOMERS_URL);
  });

  it('requests the Customers under a read-only verdict for an archived Warehouse (AC-23)', async () => {
    const requestedUrls = stubCustomersServer([PermissionId.CUSTOMERS_WATCH]);
    const store = authenticatedStore();

    await loadCustomers({ context: readOnlyContext(store) });

    expect(requestedUrls).toContain(CUSTOMERS_URL);
  });

  it('dispatches its own read with subscribe: false (sad.md §4.4)', async () => {
    stubCustomersServer([PermissionId.CUSTOMERS_WATCH]);
    const store = authenticatedStore();
    const initiate = vi.spyOn(customerApi.endpoints.listCustomers, 'initiate');

    await loadCustomers({ context: enteredContext(store) });

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
