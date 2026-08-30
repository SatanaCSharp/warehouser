import { randomUUID } from 'node:crypto';

import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
// The half of AC-19b that a unit test with a repository double cannot reach: `sad.md` §8 requires
// the floor to be re-checked "against locked rows at the moment the change is recorded, never
// against the values the member composed against". Here the three lifecycle commands, their real
// repositories and a real transaction run together, so what is proven is that the refused amendment
// leaves the stored row **exactly** as it was — not merely that a double was not called.
import { CustomerOrderLifecycleService } from 'customer-orders/domain/services/customer-order-lifecycle.service';
import { AmendCustomerOrderCommand } from 'customer-orders/usecases/commands/amend-customer-order.command';
import { CancelCustomerOrderCommand } from 'customer-orders/usecases/commands/cancel-customer-order.command';
import { RecordCustomerOrderCommand } from 'customer-orders/usecases/commands/record-customer-order.command';
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
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-26T10:00:00.000Z');
const later = new Date('2026-08-26T12:00:00.000Z');
const neededBy = '2099-01-01';

const context = new DbTransactionContext(dataSource);
const transactions = new DbTransactionService(dataSource, context);

let newCustomerOrderId = randomUUID();

const lifecycleRepository = new CustomerOrderLifecycleRepository(dataSource);

const recordCommand = new RecordCustomerOrderCommand(
  lifecycleRepository,
  new ItemCatalogueRepository(dataSource),
  { customerOrderId: () => newCustomerOrderId, now: () => later },
);
const lifecycleService = new CustomerOrderLifecycleService(lifecycleRepository);
const amendCommand = new AmendCustomerOrderCommand(
  lifecycleRepository,
  lifecycleService,
  { now: () => later },
);
const cancelCommand = new CancelCustomerOrderCommand(
  lifecycleRepository,
  lifecycleService,
  { now: () => later },
);

// `accounts.user_id` / `users.account_id` form a deferred circular FK pair, so both inserts must
// land inside the same transaction — the pattern every integration spec in this repository uses.
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

const seed = async (deactivatedAt: Date | null = null): Promise<Seeded> => {
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
    deactivatedAt,
    createdAt: now,
    updatedAt: now,
  });

  return { warehouseId: warehouse.id!, userId, itemId };
};

const actorIn = (seeded: Seeded, permissionId: string) =>
  ({
    userId: seeded.userId,
    warehouseId: seeded.warehouseId,
    roleId: randomUUID(),
    roleKind: 'custom',
    permissionId,
    archived: false,
  }) as never;

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

// An Allocation exists only because an arrival was confirmed, so the fixture builds the chain it
// hangs from (`fk_arrival_allocations_link`).
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

describeIntegration('the Customer Order lifecycle commands', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  beforeEach(() => {
    newCustomerOrderId = randomUUID();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE arrival_allocations, purchase_draft_demand_snapshots, purchase_draft_line_links, purchase_draft_lines, purchase_drafts, item_stock_adjustments, customer_orders, items, warehouse_memberships, roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  // AC-01 — the recorded order exists in the product, Unfulfilled and waiting for everything it
  // asked for, with the member who recorded it and when.
  it('AC-01: records demand as an Unfulfilled order for its full quantity', async () => {
    const seeded = await seed();

    const recorded = await transactions.executeInTransaction({}, () =>
      recordCommand.execute(actorIn(seeded, 'CUSTOMER_ORDERS:CREATE'), {
        itemId: seeded.itemId,
        customerName: 'Test Customer North',
        quantity: 100,
        neededBy,
      }),
    );

    expect(recorded).toMatchObject({
      id: newCustomerOrderId,
      quantity: 100,
      outstandingQuantity: 100,
      state: 'unfulfilled',
      recordedByUserId: seeded.userId,
    });
    expect(await readOrder(newCustomerOrderId)).toMatchObject({
      warehouseId: seeded.warehouseId,
      itemId: seeded.itemId,
      customerName: 'Test Customer North',
      outstandingQuantity: 100,
      state: 'unfulfilled',
    });
  });

  // AC-03 — an Item that exists only in another Warehouse is refused, and nothing distinguishes
  // that refusal from the one a missing Item produces.
  it('AC-03: refuses an Item of another Warehouse exactly as a missing one, storing nothing', async () => {
    const acting = await seed();
    const elsewhere = await seed();

    const foreign = transactions.executeInTransaction({}, () =>
      recordCommand.execute(actorIn(acting, 'CUSTOMER_ORDERS:CREATE'), {
        itemId: elsewhere.itemId,
        customerName: 'Test Customer North',
        quantity: 100,
        neededBy,
      }),
    );
    await expect(foreign).rejects.toBeInstanceOf(ApplicationError);
    await expect(foreign).rejects.toMatchObject({
      code: ErrorCode.ITEMS_TARGET_UNAVAILABLE,
    });

    const missing = transactions.executeInTransaction({}, () =>
      recordCommand.execute(actorIn(acting, 'CUSTOMER_ORDERS:CREATE'), {
        itemId: randomUUID(),
        customerName: 'Test Customer North',
        quantity: 100,
        neededBy,
      }),
    );
    await expect(missing).rejects.toMatchObject({
      code: ErrorCode.ITEMS_TARGET_UNAVAILABLE,
    });

    expect(
      await dataSource.manager.getRepository(CustomerOrderEntity).count(),
    ).toBe(0);
  });

  // AC-19b — the floor is decided against the **locked** row inside the transaction, and the
  // refusal leaves the Customer Order exactly as it was: every column, `updated_at` included.
  it('AC-19b: refuses a quantity below the allocated total and leaves the order exactly as it was', async () => {
    const seeded = await seed();
    const customerOrderId = await seedCustomerOrder(seeded, {
      quantity: 100,
      outstandingQuantity: 20,
    });
    await seedAllocation(seeded, customerOrderId, 80);
    const before = await readOrder(customerOrderId);

    const rejection = transactions.executeInTransaction({}, () =>
      amendCommand.execute(
        actorIn(seeded, 'CUSTOMER_ORDERS:UPDATE'),
        customerOrderId,
        { quantity: 60 },
      ),
    );

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.CUSTOMER_ORDERS_QUANTITY_BELOW_ALLOCATED,
      details: { allocatedQuantity: 80, submittedQuantity: 60 },
    });
    expect(await readOrder(customerOrderId)).toEqual(before);
  });

  // AC-19 — the Outstanding Quantity is recalculated on every amendment, and a Fulfilled order
  // whose quantity was raised counts as Unfulfilled again so it returns to the consolidated demand.
  // `chk_customer_orders_state_outstanding` would refuse any other pairing of the two.
  it('AC-19: raising a Fulfilled order returns it to Unfulfilled with the recalculated outstanding', async () => {
    const seeded = await seed();
    const customerOrderId = await seedCustomerOrder(seeded, {
      quantity: 80,
      outstandingQuantity: 0,
      state: 'fulfilled',
    });
    await seedAllocation(seeded, customerOrderId, 80);

    const amended = await transactions.executeInTransaction({}, () =>
      amendCommand.execute(
        actorIn(seeded, 'CUSTOMER_ORDERS:UPDATE'),
        customerOrderId,
        { quantity: 100 },
      ),
    );

    expect(amended).toMatchObject({
      quantity: 100,
      outstandingQuantity: 20,
      state: 'unfulfilled',
    });
    expect(await readOrder(customerOrderId)).toMatchObject({
      quantity: 100,
      outstandingQuantity: 20,
      state: 'unfulfilled',
    });
  });

  // AC-19 — lowering the quantity to exactly what has already arrived leaves the customer waiting
  // for nothing, which is Fulfilled. The Outstanding Quantity reaches zero by recalculation, never
  // by being clamped there in place of a refusal.
  it('AC-19: lowering an order to its allocated total marks it Fulfilled', async () => {
    const seeded = await seed();
    const customerOrderId = await seedCustomerOrder(seeded, {
      quantity: 100,
      outstandingQuantity: 20,
    });
    await seedAllocation(seeded, customerOrderId, 80);

    await transactions.executeInTransaction({}, () =>
      amendCommand.execute(
        actorIn(seeded, 'CUSTOMER_ORDERS:UPDATE'),
        customerOrderId,
        { quantity: 80 },
      ),
    );

    expect(await readOrder(customerOrderId)).toMatchObject({
      quantity: 80,
      outstandingQuantity: 0,
      state: 'fulfilled',
    });
  });

  // AC-19a — the cancellation records the reason, the acting member and the time together
  // (`chk_customer_orders_cancellation_attribution`), and nothing of the linked frozen draft is
  // written: its Drift Signal is derived on its next read (§6.8), never stored here.
  it('AC-19a: cancels with reason, member and time, touching no linked draft', async () => {
    const seeded = await seed();
    const customerOrderId = await seedCustomerOrder(seeded);
    await seedAllocation(seeded, customerOrderId, 30);
    const linkBefore = await dataSource.manager
      .getRepository(PurchaseDraftLineLinkEntity)
      .findOneBy({ customerOrderId });

    const cancelled = await transactions.executeInTransaction({}, () =>
      cancelCommand.execute(
        actorIn(seeded, 'CUSTOMER_ORDERS:CANCEL'),
        customerOrderId,
        { cancellationReason: 'The customer no longer needs the goods' },
      ),
    );

    expect(cancelled).toMatchObject({
      state: 'cancelled',
      cancellationReason: 'The customer no longer needs the goods',
      cancelledByUserId: seeded.userId,
      cancelledAt: later,
    });
    expect(
      await dataSource.manager
        .getRepository(PurchaseDraftLineLinkEntity)
        .findOneBy({ customerOrderId }),
    ).toEqual(linkBefore);
  });

  // openapi.yaml `invalidState` — a cancelled order is not amended or cancelled again.
  it('refuses to amend or cancel an order that is already cancelled', async () => {
    const seeded = await seed();
    const customerOrderId = await seedCustomerOrder(seeded, {
      state: 'cancelled',
      cancellationReason: 'Already gone',
      cancelledByUserId: seeded.userId,
      cancelledAt: now,
    });

    await expect(
      transactions.executeInTransaction({}, () =>
        amendCommand.execute(
          actorIn(seeded, 'CUSTOMER_ORDERS:UPDATE'),
          customerOrderId,
          { quantity: 120 },
        ),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.CUSTOMER_ORDERS_INVALID_STATE });

    await expect(
      transactions.executeInTransaction({}, () =>
        cancelCommand.execute(
          actorIn(seeded, 'CUSTOMER_ORDERS:CANCEL'),
          customerOrderId,
          { cancellationReason: 'Again' },
        ),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.CUSTOMER_ORDERS_INVALID_STATE });
  });
});
