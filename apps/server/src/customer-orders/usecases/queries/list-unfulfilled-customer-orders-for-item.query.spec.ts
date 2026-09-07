// T10 — `customer-orders/usecases/queries/list-unfulfilled-customer-orders-for-item.query.ts`
// does not exist yet. tasks/consolidated-demand-read.md §What names this as one of three queries
// this task adds: "the Unfulfilled Customer Orders behind one Demand Line" — the expandable
// sub-rows of the Demand destination (sad.md §5 `customer-orders/usecases`). Served by
// `GET /api/v1/warehouses/{warehouseId}/customer-orders?itemId=…&state=unfulfilled`
// (openapi.yaml ~line 386), which T11 exposes and depends on this query existing to call.
import { ListUnfulfilledCustomerOrdersForItemQuery } from 'customer-orders/usecases/queries/list-unfulfilled-customer-orders-for-item.query';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const itemId = uuid('101');

const currentUser: AccessCurrentUser = {
  userId: uuid('2'),
  warehouseId,
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'CUSTOMER_ORDERS:WATCH',
  observedPermissionIds: [],
  archived: false,
};

const now = new Date('2026-08-26T10:00:00.000Z');

// The shared persistence entity a `CustomerOrderLifecycleRepository`-style read returns —
// `openapi.yaml` `CustomerOrder` is the mapped shape this query's caller (the Demand destination's
// sub-rows) receives.
const unfulfilledOrderEntity = {
  id: uuid('201'),
  warehouseId,
  itemId,
  customerName: 'Test Customer North',
  quantity: 40,
  outstandingQuantity: 15,
  neededBy: '2026-10-01',
  state: 'unfulfilled',
  cancellationReason: null,
  recordedByUserId: uuid('3'),
  cancelledByUserId: null,
  cancelledAt: null,
  createdAt: now,
  updatedAt: now,
};

const customerOrderLifecycleRepositoryDouble = () => ({
  listCustomerOrders: jest.fn().mockResolvedValue([unfulfilledOrderEntity]),
});

describe('ListUnfulfilledCustomerOrdersForItemQuery', () => {
  it("reads the acting Warehouse's Unfulfilled Customer Orders behind one Item", async () => {
    const customerOrderLifecycleRepository =
      customerOrderLifecycleRepositoryDouble();
    const query = new ListUnfulfilledCustomerOrdersForItemQuery(
      customerOrderLifecycleRepository as never,
    );

    await expect(query.execute(currentUser, itemId)).resolves.toEqual([
      {
        id: unfulfilledOrderEntity.id,
        itemId,
        customerName: 'Test Customer North',
        quantity: 40,
        outstandingQuantity: 15,
        neededBy: '2026-10-01',
        state: 'unfulfilled',
        cancellationReason: null,
        recordedByUserId: unfulfilledOrderEntity.recordedByUserId,
        cancelledByUserId: null,
        cancelledAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    // Scoped to the acting Warehouse, this Item, and forced to `state: 'unfulfilled'` — a
    // Fulfilled or cancelled order behind the same Item is never one of these sub-rows (AC-04,
    // AC-17a).
    expect(
      customerOrderLifecycleRepository.listCustomerOrders,
    ).toHaveBeenCalledWith(warehouseId, { itemId, state: 'unfulfilled' });
    expect(
      customerOrderLifecycleRepository.listCustomerOrders,
    ).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list when the Item has no Unfulfilled Customer Orders', async () => {
    const customerOrderLifecycleRepository =
      customerOrderLifecycleRepositoryDouble();
    customerOrderLifecycleRepository.listCustomerOrders.mockResolvedValue([]);
    const query = new ListUnfulfilledCustomerOrdersForItemQuery(
      customerOrderLifecycleRepository as never,
    );

    await expect(query.execute(currentUser, itemId)).resolves.toEqual([]);
  });
});
