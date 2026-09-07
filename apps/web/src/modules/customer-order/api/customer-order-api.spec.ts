import { afterEach, describe, expect, it, vi } from 'vitest';

import { customerApi } from 'modules/customer/api/customer-api';
import { customerOrderApi } from 'modules/customer-order/api/customer-order-api';
import { itemApi } from 'modules/item/api/item-api';
import { purchaseDraftApi } from 'modules/purchase-draft/api/purchase-draft-api';
import { makeStore } from 'store';
import { accessIds } from 'test/access-fixtures';

// T19 — DoD: "A test proves recording, amending and cancelling each
// invalidate the demand, drafts and Items tags so every affected view
// refreshes (AC-19, AC-19a)". `PurchaseDrafts` carries no query yet (T20 owns
// the drafts destination), so this asserts the two tags with a live
// subscriber today — `Demand` and `Items` — both refetch after each mutation,
// which is what a real cache invalidation looks like rather than an
// introspection of the endpoint config.

const warehouseId = accessIds.warehouse;
const demandUrl = `/api/v1/warehouses/${warehouseId}/demand`;
const itemsUrl = `/api/v1/warehouses/${warehouseId}/items`;

const customerOrder = {
  id: '00000000-0000-4000-8000-000000000301',
  itemId: '00000000-0000-4000-8000-000000000240',
  // A typed-name order names no Customer and therefore no Delivery Address:
  // `customerOrderIdentifiedSchema` carries `chk_customer_orders_customer_identity`
  // as a refinement, so a Customer and a typed name are mutually exclusive and
  // one of them is required (AC-11a, AC-24).
  customer: null,
  customerName: 'Nordwind Logistik',
  destination: null,
  quantity: 500,
  outstandingQuantity: 500,
  neededBy: '2026-09-01',
  state: 'unfulfilled',
  cancellationReason: null,
  recordedByUserId: accessIds.actingUser,
  cancelledByUserId: null,
  cancelledAt: null,
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-08-01T09:00:00.000Z',
};

describe('customerOrderApi tag invalidation (AC-19, AC-19a)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const requestCounts = (): {
    fetchMock: ReturnType<typeof vi.fn>;
    countOf: (url: string) => number;
  } => {
    const fetchMock = vi.fn((input: Request | string | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === demandUrl) {
        return Promise.resolve(Response.json([]));
      }
      if (url === itemsUrl) {
        return Promise.resolve(Response.json([]));
      }
      if (url.startsWith(`/api/v1/warehouses/${warehouseId}/customer-orders`)) {
        return Promise.resolve(Response.json(customerOrder));
      }
      return Promise.resolve(Response.json({}, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const countOf = (url: string): number =>
      fetchMock.mock.calls.filter(([input]) => {
        const requested = String(input instanceof Request ? input.url : input);
        return requested === url;
      }).length;
    return { fetchMock, countOf };
  };

  const runMutation = (
    store: ReturnType<typeof makeStore>,
    name: 'recordCustomerOrder' | 'amendCustomerOrder' | 'cancelCustomerOrder',
  ): Promise<unknown> => {
    if (name === 'recordCustomerOrder') {
      return store
        .dispatch(
          customerOrderApi.endpoints.recordCustomerOrder.initiate({
            warehouseId,
            input: {
              itemId: customerOrder.itemId,
              customerName: customerOrder.customerName,
              quantity: customerOrder.quantity,
              neededBy: customerOrder.neededBy,
            },
          }),
        )
        .unwrap();
    }
    if (name === 'amendCustomerOrder') {
      return store
        .dispatch(
          customerOrderApi.endpoints.amendCustomerOrder.initiate({
            customerName: customerOrder.customerName,
            warehouseId,
            customerOrderId: customerOrder.id,
            input: { quantity: 600 },
          }),
        )
        .unwrap();
    }
    return store
      .dispatch(
        customerOrderApi.endpoints.cancelCustomerOrder.initiate({
          customerName: customerOrder.customerName,
          warehouseId,
          customerOrderId: customerOrder.id,
          input: { cancellationReason: 'Customer withdrew' },
        }),
      )
      .unwrap();
  };

  it.each([
    'recordCustomerOrder',
    'amendCustomerOrder',
    'cancelCustomerOrder',
  ] as const)('%s invalidates the Demand and Items tags', async (name) => {
    const { countOf } = requestCounts();
    const store = makeStore();

    // Live subscribers on both invalidated tags, exactly as the Demand and
    // Items destinations keep one while mounted.
    const demandSubscription = store.dispatch(
      customerOrderApi.endpoints.readDemand.initiate(warehouseId),
    );
    const itemsSubscription = store.dispatch(
      itemApi.endpoints.listItems.initiate(warehouseId),
    );
    await Promise.all([demandSubscription, itemsSubscription]);

    expect(countOf(demandUrl)).toBe(1);
    expect(countOf(itemsUrl)).toBe(1);

    await runMutation(store, name);
    // RTK Query's tag invalidation refetches on the next tick.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(countOf(demandUrl)).toBe(2);
    expect(countOf(itemsUrl)).toBe(2);

    demandSubscription.unsubscribe();
    itemsSubscription.unsubscribe();
  });
});

// --- delivery-addresses T22 — the redirection ---------------------------------------------------
//
// DoD: "A redirection invalidates the tags that feed the drift view" and
// "Cache entries are keyed per Warehouse". A redirection changes no quantity
// anywhere, so `Items` is deliberately **not** invalidated; what it changes is
// where an outstanding order is going, which is what the consolidated demand,
// every frozen draft's Address Drift and the Customer's awaiting list each
// report on their own next read (AC-11b, AC-18).

const otherWarehouseId = '00000000-0000-4000-8000-0000000000ff';
const draftsUrl = `/api/v1/warehouses/${warehouseId}/purchase-drafts`;
const customersUrl = `/api/v1/warehouses/${warehouseId}/customers`;
const deliveryAddressId = '00000000-0000-4000-8000-000000000703';

const redirectedOrder = {
  ...customerOrder,
  customer: { id: '00000000-0000-4000-8000-000000000701', name: 'Nordwind' },
  customerName: null,
  destination: {
    deliveryAddressId,
    addressText: 'Dockweg 3, 20457 Hamburg',
    accessNotes: null,
    isMain: false,
    deactivatedAt: null,
  },
};

describe('customerOrderApi redirection (AC-11b)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubServer = (): ((url: string) => number) => {
    const fetchMock = vi.fn((input: Request | string | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('/delivery-address')) {
        return Promise.resolve(Response.json(redirectedOrder));
      }
      if (url.startsWith('/api/v1/warehouses/')) {
        return Promise.resolve(Response.json([]));
      }
      return Promise.resolve(Response.json({}, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    return (url: string): number =>
      fetchMock.mock.calls.filter(([input]) => {
        const requested = String(input instanceof Request ? input.url : input);
        return requested === url;
      }).length;
  };

  it('invalidates the demand, drafts and customers tags a redirection changes', async () => {
    const countOf = stubServer();
    const store = makeStore();

    const subscriptions = [
      store.dispatch(
        customerOrderApi.endpoints.readDemand.initiate(warehouseId),
      ),
      store.dispatch(
        purchaseDraftApi.endpoints.listPurchaseDrafts.initiate({
          warehouseId,
        }),
      ),
      store.dispatch(customerApi.endpoints.listCustomers.initiate(warehouseId)),
    ];
    await Promise.all(subscriptions);

    expect(countOf(demandUrl)).toBe(1);
    expect(countOf(draftsUrl)).toBe(1);
    expect(countOf(customersUrl)).toBe(1);

    await store
      .dispatch(
        customerOrderApi.endpoints.redirectCustomerOrder.initiate({
          customerName: 'Nordwind',
          warehouseId,
          customerOrderId: customerOrder.id,
          input: { customerDeliveryAddressId: deliveryAddressId },
        }),
      )
      .unwrap();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(countOf(demandUrl)).toBe(2);
    expect(countOf(draftsUrl)).toBe(2);
    expect(countOf(customersUrl)).toBe(2);

    subscriptions.forEach((subscription) => subscription.unsubscribe());
  });

  it('keeps every demand cache entry and the redirection itself keyed per Warehouse (AC-12)', async () => {
    const countOf = stubServer();
    const store = makeStore();

    const here = store.dispatch(
      customerOrderApi.endpoints.readDemand.initiate(warehouseId),
    );
    const there = store.dispatch(
      customerOrderApi.endpoints.readDemand.initiate(otherWarehouseId),
    );
    const ordersHere = store.dispatch(
      customerOrderApi.endpoints.listCustomerOrders.initiate({
        warehouseId,
        query: { state: 'unfulfilled' },
      }),
    );
    const ordersThere = store.dispatch(
      customerOrderApi.endpoints.listCustomerOrders.initiate({
        warehouseId: otherWarehouseId,
        query: { state: 'unfulfilled' },
      }),
    );
    await Promise.all([here, there, ordersHere, ordersThere]);

    // Two Warehouses, four entries: neither read can serve the other's answer,
    // so a Customer, an address or a demand line never crosses that boundary
    // in cache.
    const keys = Object.keys(store.getState().api.queries);
    expect(keys.filter((key) => key.includes(warehouseId))).toHaveLength(2);
    expect(keys.filter((key) => key.includes(otherWarehouseId))).toHaveLength(
      2,
    );

    // The write is addressed the same way: the Warehouse is in the path, so a
    // redirection composed in one Warehouse can never be issued against
    // another (AC-12).
    await store
      .dispatch(
        customerOrderApi.endpoints.redirectCustomerOrder.initiate({
          customerName: 'Nordwind',
          warehouseId: otherWarehouseId,
          customerOrderId: customerOrder.id,
          input: { customerDeliveryAddressId: deliveryAddressId },
        }),
      )
      .unwrap();

    expect(
      countOf(
        `/api/v1/warehouses/${otherWarehouseId}/customer-orders/${customerOrder.id}/delivery-address`,
      ),
    ).toBe(1);

    [here, there, ordersHere, ordersThere].forEach((subscription) =>
      subscription.unsubscribe(),
    );
  });
});
