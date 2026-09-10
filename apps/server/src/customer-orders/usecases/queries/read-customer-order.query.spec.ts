import { PermissionId } from '@warehouser/shared-types/enums';
import { AssertionError } from '@warehouser/shared-types/errors';
import { ReadCustomerOrderQuery } from 'customer-orders/usecases/queries/read-customer-order.query';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { describe, expect, it, vi } from 'vitest';

// T13 — the read-back projection every Customer Order **mutation** answers with (openapi.yaml
// `recordCustomerOrder`, `amendCustomerOrder`, `redirectCustomerOrder`, `cancelCustomerOrder`).
//
// It exists so there is exactly **one** projection of a Customer Order in the application. A
// controller that mapped a command's own result instead would be a second place the redaction of
// AC-09a has to be remembered, and the one that is remembered second is the one that leaks. The
// redaction rule is therefore identical to the list's and asserted here again on both sides,
// because "the other query does it" is not a property any test of this one can rely on.

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const customerOrderId = uuid('601');
const customerId = uuid('201');

const CUSTOMER_NAME = 'Test Customer North';
const ADDRESS_TEXT = 'Test Address 1, Test City';
const ACCESS_NOTES = 'Gate code on the intercom; deliveries 09:00-17:00';

const member = (
  observedPermissionIds: readonly PermissionId[],
): AccessCurrentUser => ({
  userId: uuid('2'),
  warehouseId,
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: PermissionId.CUSTOMER_ORDERS_UPDATE,
  observedPermissionIds,
  archived: false,
});

const now = new Date('2026-08-26T10:00:00.000Z');

const identifiedRow = {
  id: customerOrderId,
  itemId: uuid('101'),
  customerId,
  customerCurrentName: CUSTOMER_NAME,
  typedCustomerName: null,
  deliveryAddressId: uuid('301'),
  addressText: ADDRESS_TEXT,
  accessNotes: ACCESS_NOTES,
  isMain: false,
  deactivatedAt: null,
  quantity: 100,
  outstandingQuantity: 40,
  neededBy: '2026-09-20',
  state: 'unfulfilled',
  cancellationReason: null,
  recordedByUserId: uuid('3'),
  cancelledByUserId: null,
  cancelledAt: null,
  createdAt: now,
  updatedAt: now,
};

const redactedRow = {
  id: identifiedRow.id,
  itemId: identifiedRow.itemId,
  quantity: identifiedRow.quantity,
  outstandingQuantity: identifiedRow.outstandingQuantity,
  neededBy: identifiedRow.neededBy,
  state: identifiedRow.state,
  cancellationReason: null,
  recordedByUserId: identifiedRow.recordedByUserId,
  cancelledByUserId: null,
  cancelledAt: null,
  createdAt: now,
  updatedAt: now,
};

const repositoryDouble = () => ({
  listIdentifiedCustomerOrders: vi.fn().mockResolvedValue([identifiedRow]),
  listRedactedCustomerOrders: vi.fn().mockResolvedValue([redactedRow]),
});

const queryOver = (repository: ReturnType<typeof repositoryDouble>) =>
  new ReadCustomerOrderQuery(repository as never);

describe('ReadCustomerOrderQuery', () => {
  // AC-11/AC-11b — the mutation responses openapi.yaml documents: the order with the Customer it
  // names and the address it is now going to.
  it('reads the one order with its Customer and destination when CUSTOMERS:WATCH is observed', async () => {
    const repository = repositoryDouble();

    await expect(
      queryOver(repository).execute(
        member([PermissionId.CUSTOMERS_WATCH]),
        customerOrderId,
      ),
    ).resolves.toEqual({
      id: customerOrderId,
      itemId: identifiedRow.itemId,
      customer: { id: customerId, name: CUSTOMER_NAME },
      customerName: null,
      destination: {
        deliveryAddressId: identifiedRow.deliveryAddressId,
        addressText: ADDRESS_TEXT,
        accessNotes: ACCESS_NOTES,
        isMain: false,
        deactivatedAt: null,
      },
      quantity: 100,
      outstandingQuantity: 40,
      neededBy: '2026-09-20',
      state: 'unfulfilled',
      cancellationReason: null,
      recordedByUserId: identifiedRow.recordedByUserId,
      cancelledByUserId: null,
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
    });
    // One row by identifier: the read needs no ordering, and asserting the exact arguments is what
    // keeps the Warehouse scoping of AC-12 from being dropped silently.
    expect(repository.listIdentifiedCustomerOrders).toHaveBeenCalledWith(
      warehouseId,
      { customerOrderId },
    );
  });

  // AC-09a — a member who may amend demand but may not read customers gets their amendment back
  // with the identity withheld, exactly as the list withholds it. Asserted over the serialized
  // projection, so a `null` or an empty string fails here.
  it('withholds the customer, the address and the access notes without CUSTOMERS:WATCH (AC-09a)', async () => {
    const repository = repositoryDouble();

    const projection = await queryOver(repository).execute(
      member([]),
      customerOrderId,
    );
    const serialized = JSON.stringify(projection);

    expect(serialized).not.toContain(CUSTOMER_NAME);
    expect(serialized).not.toContain(ADDRESS_TEXT);
    expect(serialized).not.toContain(ACCESS_NOTES);
    expect(serialized).not.toContain(customerId);
    expect(projection).not.toHaveProperty('customer');
    expect(projection).not.toHaveProperty('customerName');
    expect(projection).not.toHaveProperty('destination');
    expect(repository.listIdentifiedCustomerOrders).not.toHaveBeenCalled();
  });

  // AC-12 — the read is scoped to the acting Warehouse, so an order of another Warehouse resolves
  // to nothing here exactly as a missing one does. Reaching that state after a mutation the same
  // request has just applied is a defect and not a member-facing case, so it is an `AssertionError`
  // the global filter reports as an internal error and never explains (server-error-handling.md §2).
  it('raises a defect rather than an empty response when the order does not resolve', async () => {
    const repository = repositoryDouble();
    repository.listRedactedCustomerOrders.mockResolvedValue([]);

    await expect(
      queryOver(repository).execute(member([]), customerOrderId),
    ).rejects.toBeInstanceOf(AssertionError);
  });
});
