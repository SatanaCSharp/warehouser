import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { ArrivalAllocationEntity } from 'shared/domain/entities/arrival-allocation.entity';
import { CustomerEntity } from 'shared/domain/entities/customer.entity';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
// `CustomerOrderLifecycleRepository` does not exist yet (T8) — this is the RED for the locked
// allocated-total read `sad.md` §6.10 requires: "locks the Customer Order and reads the total
// already allocated to it **in the same transaction**". Both halves are asserted here, because
// either one alone leaves AC-19b's floor decidable against a stale value:
//   - the total must be the SUM across every Allocation made to the order, not one of them;
//   - the read must actually take the row lock, so a concurrent amendment waits for it.
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const now = new Date('2026-08-26T10:00:00.000Z');
const later = new Date('2026-08-26T12:00:00.000Z');
const neededBy = '2099-01-01';

// The shape this RED step expects the implementer to expose (data-model.md "Repository
// boundaries", tasks/customer-order-lifecycle.md). Cast through this interface because the module
// does not exist yet.
interface LockedCustomerOrderRead {
  readonly order: CustomerOrderEntity;
  readonly allocatedQuantity: number;
}

interface CustomerOrderLifecycleRepositoryContract {
  createCustomerOrder(input: {
    id: string;
    warehouseId: string;
    itemId: string;
    customerId: string | null;
    customerDeliveryAddressId: string | null;
    customerName: string | null;
    quantity: number;
    outstandingQuantity: number;
    neededBy: string;
    state: string;
    recordedByUserId: string;
    recordedAt: Date;
  }): Promise<CustomerOrderEntity>;
  lockOrderWithAllocatedTotal(
    customerOrderId: string,
    warehouseId: string,
  ): Promise<LockedCustomerOrderRead | null>;
  amendCustomerOrder(
    customerOrderId: string,
    changes: {
      quantity: number;
      outstandingQuantity: number;
      neededBy: string;
      state: string;
      amendedAt: Date;
    },
  ): Promise<CustomerOrderEntity>;
  cancelCustomerOrder(
    customerOrderId: string,
    cancellation: {
      cancellationReason: string;
      cancelledByUserId: string;
      cancelledAt: Date;
    },
  ): Promise<CustomerOrderEntity>;
  redirectCustomerOrder(
    customerOrderId: string,
    customerId: string,
    customerDeliveryAddressId: string,
    redirectedAt: Date,
  ): Promise<CustomerOrderEntity>;
  listCustomerOrders(
    warehouseId: string,
    filter?: { itemId?: string; state?: string },
    order?: 'creation' | 'needed_by',
  ): Promise<CustomerOrderEntity[]>;
}

const repository = new CustomerOrderLifecycleRepository(
  dataSource,
) as unknown as CustomerOrderLifecycleRepositoryContract;

const context = new DbTransactionContext(dataSource);
const transactions = new DbTransactionService(dataSource, context);

// `accounts.user_id` / `users.account_id` form a deferred circular FK pair
// (`DEFERRABLE INITIALLY DEFERRED`), so both inserts must land inside the same transaction — the
// identical pattern every other integration spec under this directory uses.
const seedUser = async (workspaceId: string): Promise<string> => {
  const userId = randomUUID();
  await dataSource.transaction(async (manager) => {
    await manager.getRepository(AccountEntity).insert({
      id: userId,
      userId,
      normalizedEmail: `member.${userId}@example.test`,
      passwordHash: 'synthetic-hash',
      passwordHashAlgorithm: 'scrypt',
      passwordHashParameters: { cost: 1_024 },
      createdAt: now,
      updatedAt: now,
    });
    await manager.getRepository(UserEntity).insert({
      id: userId,
      accountId: userId,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    });
  });
  return userId;
};

interface Seeded {
  readonly warehouseId: string;
  readonly userId: string;
  readonly itemId: string;
}

const seed = async (): Promise<Seeded> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  const warehouse = buildWarehouse({ workspaceId: workspace.id! });
  await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);
  const userId = await seedUser(workspace.id!);

  const itemId = randomUUID();
  await dataSource.manager.getRepository(ItemEntity).insert({
    id: itemId,
    warehouseId: warehouse.id!,
    sku: `SKU-${itemId}`,
    description: 'Cable reel, 50m',
    unitOfMeasure: 'each',
    onHandQuantity: 0,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return { warehouseId: warehouse.id!, userId, itemId };
};

const seedCustomerOrder = async (
  seeded: Seeded,
  overrides: Partial<CustomerOrderEntity> = {},
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(CustomerOrderEntity).insert({
    id,
    warehouseId: seeded.warehouseId,
    itemId: seeded.itemId,
    customerName: 'Test Customer North',
    quantity: 100,
    outstandingQuantity: 100,
    neededBy,
    state: 'unfulfilled',
    cancellationReason: null,
    recordedByUserId: seeded.userId,
    cancelledByUserId: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  return id;
};

interface SeededCustomer {
  readonly customerId: string;
  readonly mainAddressId: string;
  readonly secondAddressId: string;
  readonly otherCustomerAddressId: string;
}

// AC-11 — a Customer of the seeded Warehouse with a Main and a second active Delivery Address, plus
// a second Customer holding one of its own: the row `fk_customer_orders_delivery_address` must
// refuse.
const seedCustomer = async (seeded: Seeded): Promise<SeededCustomer> => {
  const customerId = randomUUID();
  const otherCustomerId = randomUUID();
  const mainAddressId = randomUUID();
  const secondAddressId = randomUUID();
  const otherCustomerAddressId = randomUUID();

  await dataSource.manager.getRepository(CustomerEntity).insert([
    {
      id: customerId,
      warehouseId: seeded.warehouseId,
      name: 'Test Customer North',
      deactivatedAt: null,
      recordedByUserId: seeded.userId,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: otherCustomerId,
      warehouseId: seeded.warehouseId,
      name: 'Test Customer South',
      deactivatedAt: null,
      recordedByUserId: seeded.userId,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await dataSource.manager.getRepository(CustomerDeliveryAddressEntity).insert([
    {
      id: mainAddressId,
      customerId,
      warehouseId: seeded.warehouseId,
      addressText: 'Test Address 1, Test City',
      accessNotes: null,
      isMain: true,
      deactivatedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: secondAddressId,
      customerId,
      warehouseId: seeded.warehouseId,
      addressText: 'Test Address 2, Test City',
      accessNotes: null,
      isMain: false,
      deactivatedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: otherCustomerAddressId,
      customerId: otherCustomerId,
      warehouseId: seeded.warehouseId,
      addressText: 'Test Address 3, Test City',
      accessNotes: null,
      isMain: true,
      deactivatedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  return {
    customerId,
    mainAddressId,
    secondAddressId,
    otherCustomerAddressId,
  };
};

// An Allocation only exists because an arrival was confirmed, so the fixture builds the whole
// chain it hangs from: a draft closed by Arrival Confirmation, its line, and the link naming this
// Customer Order (`fk_arrival_allocations_link`).
const seedAllocation = async (
  seeded: Seeded,
  customerOrderId: string,
  allocatedQuantity: number,
): Promise<void> => {
  const purchaseDraftId = randomUUID();
  const purchaseDraftLineId = randomUUID();
  const linkId = randomUUID();

  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id: purchaseDraftId,
    warehouseId: seeded.warehouseId,
    state: 'closed',
    expectedArrivalDate: null,
    createdByUserId: seeded.userId,
    readiedByUserId: seeded.userId,
    readiedAt: now,
    arrivalConfirmedByUserId: seeded.userId,
    arrivalConfirmedAt: later,
    closedByUserId: seeded.userId,
    closedAt: later,
    closureReason: null,
    discardedByUserId: null,
    discardedAt: null,
    createdAt: now,
    updatedAt: later,
  });
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
    id: purchaseDraftLineId,
    purchaseDraftId,
    warehouseId: seeded.warehouseId,
    itemId: seeded.itemId,
    orderedQuantity: allocatedQuantity,
    packagingTypeId: null,
    valueAddingNote: null,
    createdAt: now,
    updatedAt: later,
  });
  await dataSource.manager.getRepository(PurchaseDraftLineLinkEntity).insert({
    id: linkId,
    purchaseDraftLineId,
    purchaseDraftId,
    warehouseId: seeded.warehouseId,
    customerOrderId,
    statedQuantity: allocatedQuantity,
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(ArrivalAllocationEntity).insert({
    purchaseDraftLineLinkId: linkId,
    purchaseDraftLineId,
    customerOrderId,
    allocatedQuantity,
    allocatedByUserId: seeded.userId,
    createdAt: later,
  });
};

const readOrder = (id: string): Promise<CustomerOrderEntity | null> =>
  dataSource.manager.getRepository(CustomerOrderEntity).findOneBy({ id });

// eslint-disable-next-line max-lines-per-function -- one suite covering one repository's whole persistence surface is inherently long, matching the other repository integration specs in this directory
describe('CustomerOrderLifecycleRepository', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE arrival_allocations, purchase_draft_demand_snapshots, purchase_draft_line_links, purchase_draft_lines, purchase_drafts, item_stock_adjustments, customer_orders, items, warehouse_memberships, roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  // AC-01 — the order is written Unfulfilled with its Outstanding Quantity equal to the quantity
  // recorded, together with the member who recorded it and when.
  it('records a Customer Order Unfulfilled with its full quantity outstanding', async () => {
    const seeded = await seed();
    const id = randomUUID();

    const recorded = await transactions.executeInTransaction({}, () =>
      repository.createCustomerOrder({
        id,
        warehouseId: seeded.warehouseId,
        itemId: seeded.itemId,
        customerId: null,
        customerDeliveryAddressId: null,
        customerName: 'Test Customer North',
        quantity: 100,
        outstandingQuantity: 100,
        neededBy,
        state: 'unfulfilled',
        recordedByUserId: seeded.userId,
        recordedAt: now,
      }),
    );

    expect(recorded).toMatchObject({
      id,
      quantity: 100,
      outstandingQuantity: 100,
      state: 'unfulfilled',
      recordedByUserId: seeded.userId,
      cancellationReason: null,
      cancelledByUserId: null,
      cancelledAt: null,
    });
    expect(await readOrder(id)).toMatchObject({ id, outstandingQuantity: 100 });
  });

  // AC-19b — the floor is the **total** already allocated to the order, so an order fed by two
  // arrivals of 30 and 50 has a floor of 80, not of 50.
  it('reads the total already allocated across every Allocation, in one query', async () => {
    const seeded = await seed();
    const customerOrderId = await seedCustomerOrder(seeded);
    await seedAllocation(seeded, customerOrderId, 30);
    await seedAllocation(seeded, customerOrderId, 50);

    const spy = vi.spyOn(PostgresQueryRunner.prototype, 'query');
    const before = spy.mock.calls.length;
    const locked = await transactions.executeInTransaction({}, () =>
      repository.lockOrderWithAllocatedTotal(
        customerOrderId,
        seeded.warehouseId,
      ),
    );
    // Counted at the PostgreSQL round-trip level, so an implementation that took the lock and then
    // summed the Allocations as a second statement would fail this even though it returned the same
    // figure. The transaction's own control statements are excluded by name rather than by a count,
    // so the assertion does not silently drift if the transaction service changes how it opens one.
    const queryCount = spy.mock.calls
      .slice(before)
      .map((call) => String(call[0]))
      .filter(
        (sql) =>
          !/^(?:START TRANSACTION|SET TRANSACTION|COMMIT|ROLLBACK|BEGIN)/u.test(
            sql,
          ),
      ).length;
    spy.mockRestore();

    expect(locked).toMatchObject({
      order: expect.objectContaining({ id: customerOrderId, quantity: 100 }),
      allocatedQuantity: 80,
    });
    expect(queryCount).toBe(1);
  });

  // An order nothing has arrived for has a floor of zero, not of `null` — the difference decides
  // whether AC-19b's comparison is even evaluable.
  it('reads a floor of zero for an order nothing has been allocated to', async () => {
    const seeded = await seed();
    const customerOrderId = await seedCustomerOrder(seeded);

    const locked = await transactions.executeInTransaction({}, () =>
      repository.lockOrderWithAllocatedTotal(
        customerOrderId,
        seeded.warehouseId,
      ),
    );

    expect(locked?.allocatedQuantity).toBe(0);
  });

  // AC-03 / openapi.yaml `CustomerOrderUnavailable` — the read is scoped to the acting Warehouse,
  // so an order of another Warehouse resolves to nothing exactly as a missing one does.
  it('resolves nothing for a Customer Order of another Warehouse', async () => {
    const seeded = await seed();
    const otherWarehouse = await seed();
    const customerOrderId = await seedCustomerOrder(seeded);

    const locked = await transactions.executeInTransaction({}, () =>
      repository.lockOrderWithAllocatedTotal(
        customerOrderId,
        otherWarehouse.warehouseId,
      ),
    );

    expect(locked).toBeNull();
  });

  // AC-19 — the amendment records the new quantity, the recalculated Outstanding Quantity, the
  // needed-by date and the resulting state, and it returns the row as it now stands.
  it('amends the quantity, the outstanding figure, the date and the state together', async () => {
    const seeded = await seed();
    const customerOrderId = await seedCustomerOrder(seeded, {
      quantity: 80,
      outstandingQuantity: 0,
      state: 'fulfilled',
    });

    const amended = await transactions.executeInTransaction({}, () =>
      repository.amendCustomerOrder(customerOrderId, {
        quantity: 100,
        outstandingQuantity: 20,
        neededBy: '2099-06-01',
        state: 'unfulfilled',
        amendedAt: later,
      }),
    );

    expect(amended).toMatchObject({
      quantity: 100,
      outstandingQuantity: 20,
      neededBy: '2099-06-01',
      state: 'unfulfilled',
      updatedAt: later,
    });
    expect(await readOrder(customerOrderId)).toMatchObject({
      quantity: 100,
      outstandingQuantity: 20,
      state: 'unfulfilled',
    });
  });

  // AC-19a / `chk_customer_orders_cancellation_attribution` — "the reason, the member and the time
  // arrive together or not at all". One write carries all three.
  it('cancels with its reason, its member and its time in one write', async () => {
    const seeded = await seed();
    const customerOrderId = await seedCustomerOrder(seeded);

    const cancelled = await transactions.executeInTransaction({}, () =>
      repository.cancelCustomerOrder(customerOrderId, {
        cancellationReason: 'The customer no longer needs the goods',
        cancelledByUserId: seeded.userId,
        cancelledAt: later,
      }),
    );

    expect(cancelled).toMatchObject({
      state: 'cancelled',
      cancellationReason: 'The customer no longer needs the goods',
      cancelledByUserId: seeded.userId,
      cancelledAt: later,
    });
    // AC-19a — the cancellation removes the order from the demand without rewriting what it asked
    // for: the quantity and the Outstanding Quantity stand exactly as they were.
    expect(cancelled).toMatchObject({
      quantity: 100,
      outstandingQuantity: 100,
    });
  });

  // T11 — `listCustomerOrders` serves two callers that need two different orders, so both branches
  // are pinned here against real SQL. The fixture makes the two orders **disagree**: the row needed
  // soonest is the one created last. A single ordering therefore cannot satisfy both assertions,
  // and dropping the `order` argument at either call site fails one of them.
  // AC-11 — the customer-naming shape: the Customer and the one of its Delivery Addresses this
  // order is going to, and **no** typed name, which `chk_customer_orders_customer_identity` admits
  // beside the typed-name shape above.
  it('records an order against a Customer and one of its Delivery Addresses, with no typed name', async () => {
    const seeded = await seed();
    const customer = await seedCustomer(seeded);
    const id = randomUUID();

    await transactions.executeInTransaction({}, () =>
      repository.createCustomerOrder({
        id,
        warehouseId: seeded.warehouseId,
        itemId: seeded.itemId,
        customerId: customer.customerId,
        customerDeliveryAddressId: customer.mainAddressId,
        customerName: null,
        quantity: 100,
        outstandingQuantity: 100,
        neededBy,
        state: 'unfulfilled',
        recordedByUserId: seeded.userId,
        recordedAt: now,
      }),
    );

    expect(await readOrder(id)).toMatchObject({
      id,
      customerId: customer.customerId,
      customerDeliveryAddressId: customer.mainAddressId,
      customerName: null,
    });
  });

  // AC-11b — the redirection writes the destination reference and leaves everything else standing,
  // and AC-17/sad.md §8 — "no frozen column of any Purchase Draft appears in any statement it
  // issues". The statement text is inspected for exactly that, because it is a property of the
  // shape of the write rather than of its result.
  it('moves the destination reference alone, naming no Purchase Draft table', async () => {
    const seeded = await seed();
    const customer = await seedCustomer(seeded);
    const customerOrderId = await seedCustomerOrder(seeded, {
      customerId: customer.customerId,
      customerDeliveryAddressId: customer.mainAddressId,
      customerName: null,
    });

    const spy = vi.spyOn(PostgresQueryRunner.prototype, 'query');
    const before = spy.mock.calls.length;

    const redirected = await transactions.executeInTransaction({}, () =>
      repository.redirectCustomerOrder(
        customerOrderId,
        customer.customerId,
        customer.secondAddressId,
        later,
      ),
    );

    const statements = spy.mock.calls
      .slice(before)
      .map(([sql]) => String(sql).toLowerCase());
    spy.mockRestore();

    expect(redirected).toMatchObject({
      id: customerOrderId,
      customerId: customer.customerId,
      customerDeliveryAddressId: customer.secondAddressId,
      customerName: null,
      quantity: 100,
      outstandingQuantity: 100,
      state: 'unfulfilled',
      updatedAt: later,
    });
    expect(await readOrder(customerOrderId)).toMatchObject({
      customerDeliveryAddressId: customer.secondAddressId,
      neededBy,
    });
    expect(
      statements.filter((statement) => statement.includes('purchase_draft')),
    ).toEqual([]);
  });

  // AC-11c — "a redirection to another Customer's address is refused by the reference itself"
  // (data-model.md §`customer_orders`). The application refuses it before reaching here; this is
  // the structural backstop, and it is asserted rather than assumed.
  it('is refused by the composite reference for an address of another Customer', async () => {
    const seeded = await seed();
    const customer = await seedCustomer(seeded);
    const customerOrderId = await seedCustomerOrder(seeded, {
      customerId: customer.customerId,
      customerDeliveryAddressId: customer.mainAddressId,
      customerName: null,
    });

    await expect(
      transactions.executeInTransaction({}, () =>
        repository.redirectCustomerOrder(
          customerOrderId,
          customer.customerId,
          customer.otherCustomerAddressId,
          later,
        ),
      ),
    ).rejects.toThrow();

    expect(await readOrder(customerOrderId)).toMatchObject({
      customerDeliveryAddressId: customer.mainAddressId,
    });
  });

  describe('listCustomerOrders', () => {
    interface OrderingFixture {
      readonly seeded: Seeded;
      readonly earliestNeededLatestCreated: string;
      readonly latestNeededEarliestCreated: string;
      readonly middle: string;
    }

    const seedDisagreeingOrders = async (): Promise<OrderingFixture> => {
      const seeded = await seed();
      // created first, needed last
      const latestNeededEarliestCreated = await seedCustomerOrder(seeded, {
        neededBy: '2099-03-01',
        createdAt: new Date('2026-08-26T09:00:00.000Z'),
      });
      const middle = await seedCustomerOrder(seeded, {
        neededBy: '2099-02-01',
        createdAt: new Date('2026-08-26T10:00:00.000Z'),
      });
      // created last, needed first
      const earliestNeededLatestCreated = await seedCustomerOrder(seeded, {
        neededBy: '2099-01-01',
        createdAt: new Date('2026-08-26T11:00:00.000Z'),
      });
      return {
        seeded,
        earliestNeededLatestCreated,
        latestNeededEarliestCreated,
        middle,
      };
    };

    // The default the Demand sub-rows and the draft-line Customer Order picker read; unchanged by
    // T11 so those two callers see exactly what they always did.
    it('orders by creation time by default', async () => {
      const fixture = await seedDisagreeingOrders();

      const orders = await repository.listCustomerOrders(
        fixture.seeded.warehouseId,
      );

      expect(orders.map((order) => order.id)).toEqual([
        fixture.latestNeededEarliestCreated,
        fixture.middle,
        fixture.earliestNeededLatestCreated,
      ]);
    });

    // openapi.yaml `listCustomerOrders` 200 — "ordered by needed-by date then creation time".
    it('orders by needed-by date when the needed-by ordering is requested', async () => {
      const fixture = await seedDisagreeingOrders();

      const orders = await repository.listCustomerOrders(
        fixture.seeded.warehouseId,
        {},
        'needed_by',
      );

      expect(orders.map((order) => order.id)).toEqual([
        fixture.earliestNeededLatestCreated,
        fixture.middle,
        fixture.latestNeededEarliestCreated,
      ]);
    });

    // Rows sharing a needed-by date fall back to creation time, so the response is never
    // non-deterministic between two reads.
    it('breaks a needed-by tie on creation time', async () => {
      const seeded = await seed();
      const createdFirst = await seedCustomerOrder(seeded, {
        neededBy: '2099-01-01',
        createdAt: new Date('2026-08-26T09:00:00.000Z'),
      });
      const createdSecond = await seedCustomerOrder(seeded, {
        neededBy: '2099-01-01',
        createdAt: new Date('2026-08-26T10:00:00.000Z'),
      });

      const orders = await repository.listCustomerOrders(
        seeded.warehouseId,
        {},
        'needed_by',
      );

      expect(orders.map((order) => order.id)).toEqual([
        createdFirst,
        createdSecond,
      ]);
    });

    // The narrowings openapi.yaml documents, and the Warehouse scope every read of this repository
    // carries.
    it('narrows by Item and by state, and never leaves the acting Warehouse', async () => {
      const seeded = await seed();
      const unfulfilled = await seedCustomerOrder(seeded);
      // `chk_customer_orders_cancellation_attribution` — the reason, the member and the time
      // arrive together or not at all (AC-19a), so a seeded cancelled row carries all three.
      await seedCustomerOrder(seeded, {
        state: 'cancelled',
        cancellationReason: 'Seeded cancellation',
        cancelledByUserId: seeded.userId,
        cancelledAt: later,
      });

      const everyState = await repository.listCustomerOrders(
        seeded.warehouseId,
      );
      const narrowed = await repository.listCustomerOrders(
        seeded.warehouseId,
        { itemId: seeded.itemId, state: 'unfulfilled' },
        'needed_by',
      );
      const otherWarehouse = await repository.listCustomerOrders(randomUUID());

      expect(everyState).toHaveLength(2);
      expect(narrowed.map((order) => order.id)).toEqual([unfulfilled]);
      expect(otherWarehouse).toEqual([]);
    });
  });
});
