import { afterEach, describe, expect, it, vi } from 'vitest';

import { customerOrderApi } from 'modules/customer-order/api/customer-order-api';
import { itemApi } from 'modules/item/api/item-api';
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
  customerName: 'Nordwind Logistik',
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
