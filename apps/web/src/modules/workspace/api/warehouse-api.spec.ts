import { purchaseDraftApi } from 'modules/purchase-draft/api/purchase-draft-api';
import { workspaceWarehousesApi } from 'modules/workspace/api/warehouse-api';
import { makeStore } from 'store';
import { accessIds } from 'test/access-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';

// delivery-addresses — correcting the Warehouse's own Delivery Address left the
// Purchase Drafts destination stale. An **unfrozen** Via Warehouse line's
// `warehouseDestination.addressText` is the Warehouse's current address rather
// than a captured one (`lineWarehouseDestinationSchema.frozen`), and
// `PurchaseDraftLineDestination.tsx` renders it out of the `PurchaseDrafts`
// read. A mutation declares invalidation tags whenever it can make cached query
// results stale (ADR 02-08-2026 §Decision).
//
// The assertion is a live subscriber refetching, as the other api specs make
// it, rather than an introspection of the endpoint's config: a tag nothing
// refetches on is not an invalidation.

const warehouseId = accessIds.warehouse;
const addressUrl = `/api/v1/workspace/warehouses/${warehouseId}/delivery-address`;
const draftsUrl = `/api/v1/warehouses/${warehouseId}/purchase-drafts`;

const deliveryAddress = {
  warehouseId,
  addressText: 'Test Warehouse North, Test Industrial Estate',
  accessNotes: null,
};

/** Counts **reads** only: the PUT is addressed to the read's own URL. */
const stubServer = (): ((url: string) => number) => {
  const fetchMock = vi.fn(
    (input: Request | string | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      void init;
      if (url === addressUrl) {
        return Promise.resolve(Response.json(deliveryAddress));
      }
      if (url === draftsUrl) {
        return Promise.resolve(Response.json([]));
      }
      return Promise.resolve(Response.json({}, { status: 404 }));
    },
  );
  vi.stubGlobal('fetch', fetchMock);

  return (url) =>
    fetchMock.mock.calls.filter(([input, init]) => {
      const requested = String(input instanceof Request ? input.url : input);
      return requested === url && (init?.method ?? 'GET') === 'GET';
    }).length;
};

describe('warehouseApi delivery-address invalidation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refetches the drafts an unfrozen line reads the Warehouse address into', async () => {
    const countOf = stubServer();
    const store = makeStore();

    const address = store.dispatch(
      workspaceWarehousesApi.endpoints.getWarehouseDeliveryAddress.initiate(
        warehouseId,
      ),
    );
    const drafts = store.dispatch(
      purchaseDraftApi.endpoints.listPurchaseDrafts.initiate({ warehouseId }),
    );
    await Promise.all([address, drafts]);

    expect(countOf(addressUrl)).toBe(1);
    expect(countOf(draftsUrl)).toBe(1);

    await store
      .dispatch(
        workspaceWarehousesApi.endpoints.setWarehouseDeliveryAddress.initiate({
          warehouseId,
          addressText: 'Test Warehouse South, Test Industrial Estate',
          accessNotes: null,
        }),
      )
      .unwrap();
    // RTK Query's tag invalidation refetches on the next tick.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(countOf(addressUrl)).toBe(2);
    expect(countOf(draftsUrl)).toBe(2);

    address.unsubscribe();
    drafts.unsubscribe();
  });
});
