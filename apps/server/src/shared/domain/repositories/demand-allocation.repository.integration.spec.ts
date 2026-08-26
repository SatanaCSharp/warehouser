import { randomUUID } from 'node:crypto';

// `DemandAllocationRepository` does not exist yet (T9) — this is the RED for the two properties a
// unit test with a double cannot reach: that `lockCustomerOrdersForLinks` resolves each link's
// Customer Order **through the link itself** — contracts/openapi.yaml `ArrivalAllocationCreate`
// carries only `purchaseDraftLineLinkId` and `allocatedQuantity` (`additionalProperties: false`),
// so nothing else may name which Customer Order receives the quantity — and returns the locked rows
// in **ascending identifier order regardless of insertion or argument order** (data-model.md
// "Concurrency, locks and transactions" — "the Customer Orders in ascending identifier order").
// It also proves `applyAllocations` writes the Allocation rows and the Customer Order recompute
// together, in one persistence operation, against a real database and a real transaction.
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
import { DemandAllocationRepository } from 'shared/domain/repositories/demand-allocation.repository';
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
const repository = new DemandAllocationRepository(dataSource);

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
  const id = overrides.id ?? randomUUID();
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

const seedPurchaseDraftLine = async (
  seeded: Seeded,
  purchaseDraftLineId: string,
): Promise<string> => {
  const purchaseDraftId = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id: purchaseDraftId,
    warehouseId: seeded.warehouseId,
    state: 'ready_for_ordering',
    expectedArrivalDate: null,
    createdByUserId: seeded.userId,
    readiedByUserId: seeded.userId,
    readiedAt: now,
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
    closedByUserId: null,
    closedAt: null,
    closureReason: null,
    discardedByUserId: null,
    discardedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
    id: purchaseDraftLineId,
    purchaseDraftId,
    warehouseId: seeded.warehouseId,
    itemId: seeded.itemId,
    orderedQuantity: 200,
    packagingTypeId: null,
    valueAddingNote: null,
    receivedQuantity: 200,
    createdAt: now,
    updatedAt: now,
  });
  return purchaseDraftId;
};

// `arrival_allocations` composite-FKs onto `purchase_draft_line_links(id, purchase_draft_line_id,
// customer_order_id)`, and `ArrivalAllocationCreate` carries only `purchaseDraftLineLinkId` and
// `allocatedQuantity` (contracts/openapi.yaml, `additionalProperties: false`) — "the Allocation is
// addressed through the link, not beside it". A link is therefore the one place a customer order id
// is bound to a line, and `lockCustomerOrdersForLinks` must resolve it from here, never from an
// argument the caller supplies.
const seedLink = async (
  seeded: Seeded,
  purchaseDraftLineId: string,
  customerOrderId: string,
  linkId: string,
): Promise<void> => {
  const purchaseDraftId = (
    await dataSource.manager
      .getRepository(PurchaseDraftLineEntity)
      .findOneByOrFail({ id: purchaseDraftLineId })
  ).purchaseDraftId;

  await dataSource.manager.getRepository(PurchaseDraftLineLinkEntity).insert({
    id: linkId,
    purchaseDraftLineId,
    purchaseDraftId,
    warehouseId: seeded.warehouseId,
    customerOrderId,
    statedQuantity: 1,
    createdAt: now,
    updatedAt: now,
  });
};

const readOrder = (id: string): Promise<CustomerOrderEntity | null> =>
  dataSource.manager.getRepository(CustomerOrderEntity).findOneBy({ id });

describeIntegration('DemandAllocationRepository', () => {
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

  // data-model.md "Concurrency, locks and transactions" — "the Customer Orders in ascending
  // identifier order". Three links, each to a differently-ordered Customer Order, are seeded and
  // locked in a **deliberately scrambled** argument order so that only a real `ORDER BY
  // customer_orders.id ASC` in the query, not incidental array order, can make this pass. Each
  // resolved order is proven to come from the link's own reference, not from anything else.
  it('resolves each link to its own Customer Order and locks them in ascending identifier order', async () => {
    const seeded = await seed();
    const idA = '00000000-0000-4000-8000-0000000000aa';
    const idB = '00000000-0000-4000-8000-0000000000bb';
    const idC = '00000000-0000-4000-8000-0000000000cc';
    await seedCustomerOrder(seeded, { id: idC, outstandingQuantity: 10 });
    await seedCustomerOrder(seeded, { id: idA, outstandingQuantity: 20 });
    await seedCustomerOrder(seeded, { id: idB, outstandingQuantity: 30 });
    const purchaseDraftLineId = randomUUID();
    await seedPurchaseDraftLine(seeded, purchaseDraftLineId);
    const linkToC = randomUUID();
    const linkToA = randomUUID();
    const linkToB = randomUUID();
    await seedLink(seeded, purchaseDraftLineId, idC, linkToC);
    await seedLink(seeded, purchaseDraftLineId, idA, linkToA);
    await seedLink(seeded, purchaseDraftLineId, idB, linkToB);

    const locked = await transactions.executeInTransaction({}, () =>
      repository.lockCustomerOrdersForLinks(
        [linkToC, linkToA, linkToB],
        seeded.warehouseId,
      ),
    );

    expect(locked.map(({ order }) => order.id)).toEqual([idA, idB, idC]);
    expect(
      locked.find(
        ({ purchaseDraftLineLinkId }) => purchaseDraftLineLinkId === linkToA,
      )?.order.id,
    ).toBe(idA);
    expect(
      locked.find(
        ({ purchaseDraftLineLinkId }) => purchaseDraftLineLinkId === linkToB,
      )?.order.id,
    ).toBe(idB);
    expect(
      locked.find(
        ({ purchaseDraftLineLinkId }) => purchaseDraftLineLinkId === linkToC,
      )?.order.id,
    ).toBe(idC);
  });

  // A link of another Warehouse resolves to nothing, on the same non-enumerating terms every other
  // locking read in this feature already follows (AC-03, sad.md §6.9/§6.10).
  it('resolves nothing for a link of another Warehouse', async () => {
    const seeded = await seed();
    const elsewhere = await seed();
    const foreignOrderId = await seedCustomerOrder(elsewhere);
    const foreignLineId = randomUUID();
    await seedPurchaseDraftLine(elsewhere, foreignLineId);
    const foreignLinkId = randomUUID();
    await seedLink(elsewhere, foreignLineId, foreignOrderId, foreignLinkId);

    const locked = await transactions.executeInTransaction({}, () =>
      repository.lockCustomerOrdersForLinks(
        [foreignLinkId],
        seeded.warehouseId,
      ),
    );

    expect(locked).toEqual([]);
  });

  // sad.md §6.9 step 6/7 — the Allocation rows and the Customer Order recompute "land together or
  // not at all". One repository method, one persistence operation.
  it('writes the Allocations and recomputes the Customer Orders together', async () => {
    const seeded = await seed();
    const fullyAssignedId = await seedCustomerOrder(seeded, {
      quantity: 100,
      outstandingQuantity: 100,
    });
    const partlyAssignedId = await seedCustomerOrder(seeded, {
      quantity: 60,
      outstandingQuantity: 60,
    });
    const purchaseDraftLineId = randomUUID();
    const linkId1 = randomUUID();
    const linkId2 = randomUUID();
    await seedPurchaseDraftLine(seeded, purchaseDraftLineId);
    await seedLink(seeded, purchaseDraftLineId, fullyAssignedId, linkId1);
    await seedLink(seeded, purchaseDraftLineId, partlyAssignedId, linkId2);

    const updated = await transactions.executeInTransaction({}, () =>
      repository.applyAllocations({
        allocations: [
          {
            purchaseDraftLineLinkId: linkId1,
            purchaseDraftLineId,
            customerOrderId: fullyAssignedId,
            allocatedQuantity: 100,
            allocatedByUserId: seeded.userId,
            createdAt: later,
          },
          {
            purchaseDraftLineLinkId: linkId2,
            purchaseDraftLineId,
            customerOrderId: partlyAssignedId,
            allocatedQuantity: 30,
            allocatedByUserId: seeded.userId,
            createdAt: later,
          },
        ],
        orderUpdates: [
          { id: fullyAssignedId, outstandingQuantity: 0, state: 'fulfilled' },
          {
            id: partlyAssignedId,
            outstandingQuantity: 30,
            state: 'unfulfilled',
          },
        ],
      }),
    );

    expect(updated).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: fullyAssignedId,
          outstandingQuantity: 0,
          state: 'fulfilled',
        }),
        expect.objectContaining({
          id: partlyAssignedId,
          outstandingQuantity: 30,
          state: 'unfulfilled',
        }),
      ]),
    );
    expect(await readOrder(fullyAssignedId)).toMatchObject({
      outstandingQuantity: 0,
      state: 'fulfilled',
    });
    expect(await readOrder(partlyAssignedId)).toMatchObject({
      outstandingQuantity: 30,
      state: 'unfulfilled',
    });
    expect(
      await dataSource.manager.getRepository(ArrivalAllocationEntity).find(),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          purchaseDraftLineLinkId: linkId1,
          customerOrderId: fullyAssignedId,
          allocatedQuantity: 100,
        }),
        expect.objectContaining({
          purchaseDraftLineLinkId: linkId2,
          customerOrderId: partlyAssignedId,
          allocatedQuantity: 30,
        }),
      ]),
    );
  });
});
