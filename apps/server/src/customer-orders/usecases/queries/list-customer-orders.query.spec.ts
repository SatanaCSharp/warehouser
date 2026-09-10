import { PermissionId } from '@warehouser/shared-types/enums';
import { ListCustomerOrdersQuery } from 'customer-orders/usecases/queries/list-customer-orders.query';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { describe, expect, it, vi } from 'vitest';

// T13 — the redaction of the Customer Order projection, on both sides of the observed
// `CUSTOMERS:WATCH` (AC-09a, AC-11, AC-11a, AC-24, ADR 0001).
//
// This is the security-critical spec of the feature: redaction fails **open**, so the dangerous
// direction is a field that leaks and not a field that is missing. Every withholding assertion is
// therefore made against the **serialized** projection — the bytes a response would carry — rather
// than against a property being `undefined` on an object, because a `null`, an empty string, a
// count or a differing key set all disclose something a property check would pass.
//
// The query's own behaviour is which repository read it issues. Building the redacted form by *not
// selecting* the withheld columns rather than by deleting them afterwards is the rule
// server-request-authorization.md § "Consume the observed set" states, so "the identified read was
// never issued" is asserted directly and not inferred from the result.

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const itemId = uuid('101');
const customerId = uuid('201');
const deliveryAddressId = uuid('301');

const CUSTOMER_NAME = 'Test Customer North';
const TYPED_CUSTOMER_NAME = 'Test Customer South';
const ADDRESS_TEXT = 'Test Address 1, Test City';
const ACCESS_NOTES = 'Gate code on the intercom; deliveries 09:00-17:00';

const member = (
  observedPermissionIds: readonly PermissionId[],
): AccessCurrentUser => ({
  userId: uuid('2'),
  warehouseId,
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: PermissionId.CUSTOMER_ORDERS_WATCH,
  observedPermissionIds,
  archived: false,
});

// AC-09a — the member of the criterion: `CUSTOMER_ORDERS:WATCH` and no `CUSTOMERS:WATCH`, so the
// guard resolved the observed Permission to nothing.
const withoutCustomersWatch = member([]);
const withCustomersWatch = member([PermissionId.CUSTOMERS_WATCH]);

const now = new Date('2026-08-26T10:00:00.000Z');

// The two kinds of row AC-24 puts side by side: one naming a Customer, one recorded by typing a
// name. The redacted read never selects either name, so its rows carry neither.
const identifiedRows = [
  {
    id: uuid('601'),
    itemId,
    customerId,
    customerCurrentName: CUSTOMER_NAME,
    typedCustomerName: null,
    deliveryAddressId,
    addressText: ADDRESS_TEXT,
    accessNotes: ACCESS_NOTES,
    isMain: true,
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
  },
  {
    id: uuid('602'),
    itemId,
    customerId: null,
    customerCurrentName: null,
    typedCustomerName: TYPED_CUSTOMER_NAME,
    deliveryAddressId: null,
    addressText: null,
    accessNotes: null,
    isMain: null,
    deactivatedAt: null,
    quantity: 25,
    outstandingQuantity: 25,
    neededBy: '2026-09-22',
    state: 'unfulfilled',
    cancellationReason: null,
    recordedByUserId: uuid('3'),
    cancelledByUserId: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  },
];

// What the redacted read returns: the same two orders with no identity column selected at all.
const redactedRows = identifiedRows.map((row) => ({
  id: row.id,
  itemId: row.itemId,
  quantity: row.quantity,
  outstandingQuantity: row.outstandingQuantity,
  neededBy: row.neededBy,
  state: row.state,
  cancellationReason: row.cancellationReason,
  recordedByUserId: row.recordedByUserId,
  cancelledByUserId: row.cancelledByUserId,
  cancelledAt: row.cancelledAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
}));

const repositoryDouble = () => ({
  listIdentifiedCustomerOrders: vi.fn().mockResolvedValue(identifiedRows),
  listRedactedCustomerOrders: vi.fn().mockResolvedValue(redactedRows),
});

const queryOver = (repository: ReturnType<typeof repositoryDouble>) =>
  new ListCustomerOrdersQuery(repository as never);

describe('ListCustomerOrdersQuery', () => {
  // AC-11/AC-24 — holding the observed Permission, an order naming a Customer reads with that
  // Customer and the address it is going to, and a typed-name order reads with the name and **no**
  // destination, which is what tells the member which kind of row they are looking at.
  it('carries the Customer, the typed name and the destination when CUSTOMERS:WATCH is observed (AC-11, AC-24)', async () => {
    const repository = repositoryDouble();

    await expect(
      queryOver(repository).execute(withCustomersWatch),
    ).resolves.toEqual([
      {
        id: uuid('601'),
        itemId,
        customer: { id: customerId, name: CUSTOMER_NAME },
        customerName: null,
        destination: {
          deliveryAddressId,
          addressText: ADDRESS_TEXT,
          accessNotes: ACCESS_NOTES,
          isMain: true,
          deactivatedAt: null,
        },
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
      },
      {
        id: uuid('602'),
        itemId,
        customer: null,
        customerName: TYPED_CUSTOMER_NAME,
        destination: null,
        quantity: 25,
        outstandingQuantity: 25,
        neededBy: '2026-09-22',
        state: 'unfulfilled',
        cancellationReason: null,
        recordedByUserId: uuid('3'),
        cancelledByUserId: null,
        cancelledAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    expect(repository.listRedactedCustomerOrders).not.toHaveBeenCalled();
  });

  // AC-09a — the withheld values must not be **in the response at all**. Asserted over the
  // serialized projection, so a `null`, an empty string or a nested survivor fails here.
  it('withholds every customer name, address and access note without CUSTOMERS:WATCH (AC-09a)', async () => {
    const repository = repositoryDouble();

    const projection = await queryOver(repository).execute(
      withoutCustomersWatch,
    );
    const serialized = JSON.stringify(projection);

    expect(serialized).not.toContain(CUSTOMER_NAME);
    expect(serialized).not.toContain(TYPED_CUSTOMER_NAME);
    expect(serialized).not.toContain(ADDRESS_TEXT);
    expect(serialized).not.toContain(ACCESS_NOTES);
    expect(serialized).not.toContain(customerId);
    expect(serialized).not.toContain(deliveryAddressId);
  });

  // "Absent, not null" — a nulled field is a contract violation as much as a populated one, because
  // the redacted form of openapi.yaml `CustomerOrder` closes itself with `additionalProperties:
  // false` and lists none of the three.
  it('omits the identity properties rather than nulling them (AC-09a)', async () => {
    const repository = repositoryDouble();

    const [namingACustomer] = await queryOver(repository).execute(
      withoutCustomersWatch,
    );

    expect(namingACustomer).not.toHaveProperty('customer');
    expect(namingACustomer).not.toHaveProperty('customerName');
    expect(namingACustomer).not.toHaveProperty('destination');
    expect(namingACustomer).not.toHaveProperty('customerId');
    expect(namingACustomer).not.toHaveProperty('customerDeliveryAddressId');
  });

  // AC-09a/AC-24 — "the name of a Customer and the name typed onto a Customer Order that names no
  // Customer alike". If one kind of row were withheld differently from the other, the difference
  // would itself disclose which kind of row it is, which is exactly the inference AC-24 says the
  // *presence* of a destination is allowed to carry and a redacted read is not.
  it('withholds a typed name exactly as a Customer name, so the two rows stay indistinguishable (AC-09a)', async () => {
    const repository = repositoryDouble();

    const [namingACustomer, typedName] = await queryOver(repository).execute(
      withoutCustomersWatch,
    );

    expect(Object.keys(namingACustomer).sort()).toEqual(
      Object.keys(typedName).sort(),
    );
  });

  // spec.md §6.1 "Customer disclosure through a count" — a count answers "does this exist" as
  // effectively as the record does, so none survives redaction anywhere in the response.
  it('lets no count survive redaction (AC-09a)', async () => {
    const repository = repositoryDouble();

    const projection = await queryOver(repository).execute(
      withoutCustomersWatch,
    );

    for (const order of projection) {
      expect(
        Object.keys(order).filter((key) => /count|total|badge/iu.test(key)),
      ).toEqual([]);
    }
  });

  // AC-09a's closing clause — the member "continues to see everything their own Permissions do
  // admit". Every field `CUSTOMER_ORDERS:WATCH` alone entitles them to is returned unchanged.
  it('returns everything the member’s own Permissions admit, unchanged (AC-09a)', async () => {
    const repository = repositoryDouble();

    await expect(
      queryOver(repository).execute(withoutCustomersWatch),
    ).resolves.toEqual(redactedRows);
  });

  // server-request-authorization.md § "Consume the observed set" — the redacted form is built by
  // **not selecting** the withheld columns. A query that issued the identified read and dropped the
  // fields afterwards would satisfy every assertion above and still put customer identity on the
  // wire the moment a mapping was widened.
  it('never issues the identity-bearing read without the observed Permission (ADR 0001)', async () => {
    const repository = repositoryDouble();

    await queryOver(repository).execute(withoutCustomersWatch);

    expect(repository.listIdentifiedCustomerOrders).not.toHaveBeenCalled();
    expect(repository.listRedactedCustomerOrders).toHaveBeenCalledWith(
      warehouseId,
      {},
      'needed_by',
    );
  });

  // openapi.yaml — the response is "ordered by needed-by date then creation time", which this query
  // obtains by asking for the repository's `needed_by` ordering explicitly; the default is the
  // creation ordering the two `…ForItemQuery` siblings read. Both narrowings stay optional.
  it('passes the Item and state narrowings through and requests the needed-by ordering', async () => {
    const repository = repositoryDouble();

    await queryOver(repository).execute(withCustomersWatch, {
      itemId,
      state: 'unfulfilled',
    });

    expect(repository.listIdentifiedCustomerOrders).toHaveBeenCalledWith(
      warehouseId,
      { itemId, state: 'unfulfilled' },
      'needed_by',
    );
  });

  it('returns an empty list when the Warehouse holds no Customer Orders', async () => {
    const repository = repositoryDouble();
    repository.listRedactedCustomerOrders.mockResolvedValue([]);

    await expect(
      queryOver(repository).execute(withoutCustomersWatch),
    ).resolves.toEqual([]);
  });
});
