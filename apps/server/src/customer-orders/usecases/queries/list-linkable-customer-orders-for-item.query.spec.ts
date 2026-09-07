// T10 — `customer-orders/usecases/queries/list-linkable-customer-orders-for-item.query.ts` does
// not exist yet. tasks/consolidated-demand-read.md §What names this as one of three queries this
// task adds: "the linkable Customer Orders a draft line may name" — the Customer Order picker a
// Purchase Draft line's link uses (sad.md §6.6 step 1, sad.md §5 `customer-orders/usecases`).
// Served by the same endpoint as the Demand sub-rows read,
// `GET /api/v1/warehouses/{warehouseId}/customer-orders?itemId=…&state=unfulfilled`
// (openapi.yaml ~line 386, description: "itemId together with state=unfulfilled is the
// linkable-demand read a draft line's Customer Order picker issues"). Coverage is informational —
// AC-20 requires demand already linked by another draft to still be offered here, so this query
// never excludes an order for already carrying a link.
import { ListLinkableCustomerOrdersForItemQuery } from 'customer-orders/usecases/queries/list-linkable-customer-orders-for-item.query';
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
  permissionId: 'PURCHASE_DRAFTS:CREATE',
  observedPermissionIds: [],
  archived: false,
};

const now = new Date('2026-08-26T10:00:00.000Z');

const linkableOrderEntity = {
  id: uuid('202'),
  warehouseId,
  itemId,
  customerName: 'Test Customer South',
  quantity: 50,
  outstandingQuantity: 50,
  neededBy: '2026-09-10',
  state: 'unfulfilled',
  cancellationReason: null,
  recordedByUserId: uuid('3'),
  cancelledByUserId: null,
  cancelledAt: null,
  createdAt: now,
  updatedAt: now,
};

const customerOrderLifecycleRepositoryDouble = () => ({
  listCustomerOrders: jest.fn().mockResolvedValue([linkableOrderEntity]),
});

describe('ListLinkableCustomerOrdersForItemQuery', () => {
  it("reads the acting Warehouse's Unfulfilled Customer Orders a draft line linking to this Item may name", async () => {
    const customerOrderLifecycleRepository =
      customerOrderLifecycleRepositoryDouble();
    const query = new ListLinkableCustomerOrdersForItemQuery(
      customerOrderLifecycleRepository as never,
    );

    await expect(query.execute(currentUser, itemId)).resolves.toEqual([
      {
        id: linkableOrderEntity.id,
        itemId,
        customerName: 'Test Customer South',
        quantity: 50,
        outstandingQuantity: 50,
        neededBy: '2026-09-10',
        state: 'unfulfilled',
        cancellationReason: null,
        recordedByUserId: linkableOrderEntity.recordedByUserId,
        cancelledByUserId: null,
        cancelledAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    expect(
      customerOrderLifecycleRepository.listCustomerOrders,
    ).toHaveBeenCalledWith(warehouseId, { itemId, state: 'unfulfilled' });
  });

  // AC-20 — a Demand Line two Purchase Drafts already link to must still be offered to a further
  // draft, so this query never filters an order out for already carrying Coverage. Since Coverage
  // is not part of this query's own filter, the repository double simply proves the query passes
  // every Unfulfilled order behind the Item through, without asking the repository to filter by
  // any notion of "already linked".
  it('does not narrow by existing Coverage — an already-linked order is still offered', async () => {
    const customerOrderLifecycleRepository =
      customerOrderLifecycleRepositoryDouble();
    const query = new ListLinkableCustomerOrdersForItemQuery(
      customerOrderLifecycleRepository as never,
    );

    const result = await query.execute(currentUser, itemId);

    expect(result).toHaveLength(1);
    expect(
      customerOrderLifecycleRepository.listCustomerOrders,
    ).not.toHaveBeenCalledWith(
      warehouseId,
      expect.objectContaining({ excludeLinked: expect.anything() }),
    );
  });
});
