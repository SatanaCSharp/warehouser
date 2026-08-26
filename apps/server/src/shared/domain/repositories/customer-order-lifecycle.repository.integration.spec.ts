import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { ArrivalAllocationEntity } from 'shared/domain/entities/arrival-allocation.entity';
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

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

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
    customerName: string;
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
    receivedQuantity: allocatedQuantity,
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

describeIntegration('CustomerOrderLifecycleRepository', () => {
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

    const spy = jest.spyOn(PostgresQueryRunner.prototype, 'query');
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

  // sad.md §6.10 — the read **locks** the Customer Order. This is the half a `SELECT` alone cannot
  // give: a second transaction reading the same row for update must block until the first commits,
  // which is what stops AC-19b's floor from being decided against a value another member is already
  // changing.
  it('holds the row against a second reader until the first transaction commits', async () => {
    const seeded = await seed();
    const customerOrderId = await seedCustomerOrder(seeded);

    let secondReaderResolved = false;
    let releaseFirst = (): void => {};
    const firstHolds = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = transactions.executeInTransaction({}, async () => {
      await repository.lockOrderWithAllocatedTotal(
        customerOrderId,
        seeded.warehouseId,
      );
      await firstHolds;
    });

    // A second, independent transaction asking for the same row for update.
    const secondRunner = dataSource.createQueryRunner();
    await secondRunner.connect();
    await secondRunner.startTransaction();
    const second = secondRunner
      .query('SELECT id FROM customer_orders WHERE id = $1 FOR UPDATE', [
        customerOrderId,
      ])
      .then(() => {
        secondReaderResolved = true;
      });

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(secondReaderResolved).toBe(false);

    releaseFirst();
    await first;
    await second;
    expect(secondReaderResolved).toBe(true);

    await secondRunner.commitTransaction();
    await secondRunner.release();
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
});
