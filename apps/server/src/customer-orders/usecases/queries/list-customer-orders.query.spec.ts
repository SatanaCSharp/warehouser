import { ListCustomerOrdersQuery } from 'customer-orders/usecases/queries/list-customer-orders.query';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

// T11 — `GET /api/v1/warehouses/{warehouseId}/customer-orders` (openapi.yaml `listCustomerOrders`).
// Mirrors the two sibling query specs: a repository double, the mapped result, and the exact
// arguments the query issues.
//
// The load-bearing assertion is the third one. Unlike its siblings this query narrows by nothing of
// its own — both `itemId` and `state` are optional and omitting them returns every state — and it
// asks the repository for the contract's ordering, "ordered by needed-by date then creation time".
// That ordering argument is the query's only behaviour beyond mapping, so dropping it must fail a
// test rather than silently change what the endpoint returns.

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

const cancelledOrderEntity = {
  id: uuid('202'),
  warehouseId,
  itemId,
  customerName: 'Test Customer South',
  quantity: 60,
  outstandingQuantity: 60,
  neededBy: '2026-10-05',
  state: 'cancelled',
  cancellationReason: 'The customer no longer needs the goods',
  recordedByUserId: uuid('3'),
  cancelledByUserId: uuid('5'),
  cancelledAt: now,
  createdAt: now,
  updatedAt: now,
};

const customerOrderLifecycleRepositoryDouble = () => ({
  listCustomerOrders: jest.fn().mockResolvedValue([cancelledOrderEntity]),
});

describe('ListCustomerOrdersQuery', () => {
  it("maps the acting Warehouse's Customer Orders, cancellation attribution included", async () => {
    const customerOrderLifecycleRepository =
      customerOrderLifecycleRepositoryDouble();
    const query = new ListCustomerOrdersQuery(
      customerOrderLifecycleRepository as never,
    );

    await expect(query.execute(currentUser)).resolves.toEqual([
      {
        id: cancelledOrderEntity.id,
        itemId,
        customerName: 'Test Customer South',
        quantity: 60,
        outstandingQuantity: 60,
        neededBy: '2026-10-05',
        state: 'cancelled',
        cancellationReason: 'The customer no longer needs the goods',
        recordedByUserId: cancelledOrderEntity.recordedByUserId,
        cancelledByUserId: cancelledOrderEntity.cancelledByUserId,
        cancelledAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  // Omitting both narrowings returns every state — the distinction from the two
  // `…ForItemQuery` siblings, which force `state: 'unfulfilled'` and require an Item.
  it('narrows by nothing of its own when no filter is supplied', async () => {
    const customerOrderLifecycleRepository =
      customerOrderLifecycleRepositoryDouble();
    const query = new ListCustomerOrdersQuery(
      customerOrderLifecycleRepository as never,
    );

    await query.execute(currentUser);

    expect(
      customerOrderLifecycleRepository.listCustomerOrders,
    ).toHaveBeenCalledWith(warehouseId, {}, 'needed_by');
    expect(
      customerOrderLifecycleRepository.listCustomerOrders,
    ).toHaveBeenCalledTimes(1);
  });

  // openapi.yaml — the response is "ordered by needed-by date then creation time", which this
  // query obtains by asking the shared repository for its `needed_by` ordering explicitly. The
  // default is the creation ordering the other two callers read, so omitting this argument would
  // silently return the wrong order.
  it('passes the Item and state narrowings through and requests the needed-by ordering', async () => {
    const customerOrderLifecycleRepository =
      customerOrderLifecycleRepositoryDouble();
    const query = new ListCustomerOrdersQuery(
      customerOrderLifecycleRepository as never,
    );

    await query.execute(currentUser, { itemId, state: 'unfulfilled' });

    expect(
      customerOrderLifecycleRepository.listCustomerOrders,
    ).toHaveBeenCalledWith(
      warehouseId,
      { itemId, state: 'unfulfilled' },
      'needed_by',
    );
  });

  it('returns an empty list when the Warehouse holds no Customer Orders', async () => {
    const customerOrderLifecycleRepository =
      customerOrderLifecycleRepositoryDouble();
    customerOrderLifecycleRepository.listCustomerOrders.mockResolvedValue([]);
    const query = new ListCustomerOrdersQuery(
      customerOrderLifecycleRepository as never,
    );

    await expect(query.execute(currentUser)).resolves.toEqual([]);
  });
});
