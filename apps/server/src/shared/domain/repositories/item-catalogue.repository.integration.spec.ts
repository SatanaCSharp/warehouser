import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { ItemStockAdjustmentEntity } from 'shared/domain/entities/item-stock-adjustment.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
// `ItemCatalogueRepository` does not exist yet (T5) — this is the RED for AC-06/AC-06b/AC-06c/
// AC-06d/AC-07/AC-07a's persistence half. data-model.md "Repository boundaries" and
// tasks/item-catalogue-domain.md require it to answer "is this Item already named by any Customer
// Order **or** any Purchase Draft Line" in **one** query across both tables, per
// creating-a-server-repository.md ("Prefer one purpose-built query over retrieving records
// separately and joining or filtering them in application memory").
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
// `PostgresQueryRunner.prototype.query` is the one method every TypeORM access path — raw
// `manager.query`, `repository.find`, and `QueryBuilder` alike — ultimately calls to reach
// PostgreSQL. Spying on it, rather than on any higher-level TypeORM API, counts actual round trips
// to the database regardless of which of those APIs the implementer chooses, which is what proves
// "one query" rather than merely "one repository method call".
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-25T12:00:00.000Z');

interface CreateItemInput {
  readonly id: string;
  readonly warehouseId: string;
  readonly sku: string;
  readonly description: string;
  readonly unitOfMeasure: string;
}

// The shape this RED step expects the implementer to expose (data-model.md "Repository
// boundaries", tasks/item-catalogue-domain.md). Cast through this interface because
// `ItemCatalogueRepository` is `error`-typed while the module does not exist yet.
interface ItemCatalogueRepositoryContract {
  createItem(input: CreateItemInput): Promise<void>;
  findBySku(warehouseId: string, sku: string): Promise<ItemEntity | null>;
  isNamedByDemandOrDraft(itemId: string): Promise<boolean>;
  updateItemDetails(
    itemId: string,
    details: { description: string; unitOfMeasure: string },
  ): Promise<void>;
  updateSku(itemId: string, sku: string): Promise<void>;
  setDeactivatedAt(itemId: string, deactivatedAt: Date | null): Promise<void>;
  findActiveItemsForPicker(warehouseId: string): Promise<ItemEntity[]>;
  findById(itemId: string): Promise<ItemEntity | null>;
  findItemsWithOnHandAndLatestReason(warehouseId: string): Promise<
    Array<{
      id: string;
      sku: string;
      description: string;
      unitOfMeasure: string;
      onHandQuantity: number;
      deactivatedAt: Date | null;
      latestAdjustmentReason: string | null;
    }>
  >;
}

const repository = new ItemCatalogueRepository(
  dataSource,
) as unknown as ItemCatalogueRepositoryContract;

const seedWorkspace = async (): Promise<string> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  return workspace.id as string;
};

const seedWarehouse = async (workspaceId: string): Promise<string> => {
  const warehouse = buildWarehouse({ workspaceId });
  await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);
  return warehouse.id as string;
};

// `accounts.user_id` / `users.account_id` form a deferred circular FK pair (`DEFERRABLE INITIALLY
// DEFERRED`), so both inserts must land inside the same transaction — see every other integration
// spec under this directory for the identical pattern.
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

const insertCustomerOrder = async (
  warehouseId: string,
  itemId: string,
  recordedByUserId: string,
): Promise<void> => {
  await dataSource.manager.getRepository(CustomerOrderEntity).insert({
    id: randomUUID(),
    warehouseId,
    itemId,
    customerName: 'Buyer One',
    quantity: 10,
    outstandingQuantity: 10,
    neededBy: '2026-09-30',
    state: 'unfulfilled',
    cancellationReason: null,
    recordedByUserId,
    cancelledByUserId: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  });
};

const insertPurchaseDraftWithLine = async (
  warehouseId: string,
  itemId: string,
  createdByUserId: string,
): Promise<void> => {
  const purchaseDraftId = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id: purchaseDraftId,
    warehouseId,
    state: 'draft',
    expectedArrivalDate: null,
    createdByUserId,
    readiedByUserId: null,
    readiedAt: null,
    closedByUserId: null,
    closedAt: null,
    closureReason: null,
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
    discardedByUserId: null,
    discardedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
    id: randomUUID(),
    purchaseDraftId,
    warehouseId,
    itemId,
    orderedQuantity: 5,
    packagingTypeId: null,
    valueAddingNote: null,
    receivedQuantity: null,
    createdAt: now,
    updatedAt: now,
  });
};

const insertAdjustment = async (
  itemId: string,
  warehouseId: string,
  adjustedByUserId: string,
  reason: string,
  createdAt: Date,
): Promise<void> => {
  await dataSource.manager.getRepository(ItemStockAdjustmentEntity).insert({
    id: randomUUID(),
    itemId,
    warehouseId,
    countedQuantity: 0,
    reason,
    adjustedByUserId,
    createdAt,
  });
};

// The four suites below are extracted to named top-level functions, each registering its own
// `describe`, so the outer `describeIntegration` callback stays a short table of contents
// (max-lines-per-function).

const registerIsNamedByDemandOrDraftTests = (): void => {
  describe('"is this Item already named" — one query across both tables', () => {
    // The single method under test, spied at the PostgreSQL round-trip level so an implementation
    // that reads customer_orders and purchase_draft_lines as two separate queries fails this test
    // even though it would return the same boolean.
    const withQueryCount = async <T>(
      run: () => Promise<T>,
    ): Promise<{ result: T; queryCount: number }> => {
      const spy = jest.spyOn(PostgresQueryRunner.prototype, 'query');
      const before = spy.mock.calls.length;
      const result = await run();
      const queryCount = spy.mock.calls.length - before;
      spy.mockRestore();
      return { result, queryCount };
    };

    it('is false in exactly one query when nothing names the Item', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const itemId = randomUUID();
      await repository.createItem({
        id: itemId,
        warehouseId,
        sku: 'TEST-SKU-0001',
        description: 'Cable reel, 50m',
        unitOfMeasure: 'each',
      });

      const { result, queryCount } = await withQueryCount(() =>
        repository.isNamedByDemandOrDraft(itemId),
      );

      expect(result).toBe(false);
      expect(queryCount).toBe(1);
    });

    it('is true in exactly one query when only a Customer Order names the Item', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemId = randomUUID();
      await repository.createItem({
        id: itemId,
        warehouseId,
        sku: 'TEST-SKU-0002',
        description: 'Cable reel, 100m',
        unitOfMeasure: 'each',
      });
      await insertCustomerOrder(warehouseId, itemId, userId);

      const { result, queryCount } = await withQueryCount(() =>
        repository.isNamedByDemandOrDraft(itemId),
      );

      expect(result).toBe(true);
      expect(queryCount).toBe(1);
    });

    it('is true in exactly one query when only a Purchase Draft Line names the Item', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemId = randomUUID();
      await repository.createItem({
        id: itemId,
        warehouseId,
        sku: 'TEST-SKU-0003',
        description: 'Cable reel, 200m',
        unitOfMeasure: 'each',
      });
      await insertPurchaseDraftWithLine(warehouseId, itemId, userId);

      const { result, queryCount } = await withQueryCount(() =>
        repository.isNamedByDemandOrDraft(itemId),
      );

      expect(result).toBe(true);
      expect(queryCount).toBe(1);
    });

    it('is true in exactly one query when both a Customer Order and a Purchase Draft Line name the Item', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemId = randomUUID();
      await repository.createItem({
        id: itemId,
        warehouseId,
        sku: 'TEST-SKU-0004',
        description: 'Cable reel, 300m',
        unitOfMeasure: 'each',
      });
      await insertCustomerOrder(warehouseId, itemId, userId);
      await insertPurchaseDraftWithLine(warehouseId, itemId, userId);

      const { result, queryCount } = await withQueryCount(() =>
        repository.isNamedByDemandOrDraft(itemId),
      );

      expect(result).toBe(true);
      expect(queryCount).toBe(1);
    });
  });
};

const registerSkuUniquenessTests = (): void => {
  describe('SKU uniqueness (AC-07, AC-07a)', () => {
    it('blocks a second Item with a SKU already used in the same Warehouse', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      await repository.createItem({
        id: randomUUID(),
        warehouseId,
        sku: 'TEST-SKU-DUP',
        description: 'Cable reel, 50m',
        unitOfMeasure: 'each',
      });

      await expect(
        repository.createItem({
          id: randomUUID(),
          warehouseId,
          sku: 'TEST-SKU-DUP',
          description: 'A different Item, same SKU',
          unitOfMeasure: 'each',
        }),
      ).rejects.toThrow();

      const existing = await repository.findBySku(warehouseId, 'TEST-SKU-DUP');
      expect(existing).toMatchObject({
        warehouseId,
        sku: 'TEST-SKU-DUP',
        description: 'Cable reel, 50m',
      });
    });

    it('records the same SKU as two unrelated Items in two different Warehouses', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseOneId = await seedWarehouse(workspaceId);
      const warehouseTwoId = await seedWarehouse(workspaceId);
      const itemOneId = randomUUID();
      const itemTwoId = randomUUID();

      await repository.createItem({
        id: itemOneId,
        warehouseId: warehouseOneId,
        sku: 'TEST-SKU-SHARED',
        description: 'Cable reel in Warehouse One',
        unitOfMeasure: 'each',
      });
      await repository.createItem({
        id: itemTwoId,
        warehouseId: warehouseTwoId,
        sku: 'TEST-SKU-SHARED',
        description: 'Cable reel in Warehouse Two',
        unitOfMeasure: 'each',
      });

      const itemOne = await repository.findBySku(
        warehouseOneId,
        'TEST-SKU-SHARED',
      );
      const itemTwo = await repository.findBySku(
        warehouseTwoId,
        'TEST-SKU-SHARED',
      );
      expect(itemOne?.id).toBe(itemOneId);
      expect(itemTwo?.id).toBe(itemTwoId);
      expect(itemOne?.id).not.toBe(itemTwo?.id);
    });
  });
};

const registerDeactivationTests = (): void => {
  describe('deactivation keeps the SKU taken, drops the Item from the picker list, and leaves every naming record readable and counting exactly as before (AC-06d)', () => {
    it('excludes a deactivated Item from the active picker list while its SKU stays reserved and its references are untouched', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemId = randomUUID();
      await repository.createItem({
        id: itemId,
        warehouseId,
        sku: 'TEST-SKU-DEACTIVATE',
        description: 'Cable reel, 50m',
        unitOfMeasure: 'each',
      });
      await insertCustomerOrder(warehouseId, itemId, userId);
      await insertPurchaseDraftWithLine(warehouseId, itemId, userId);

      const beforeDeactivation =
        await repository.findActiveItemsForPicker(warehouseId);
      expect(beforeDeactivation.map((item) => item.id)).toContain(itemId);

      // `chk_items_deactivation_order` requires deactivated_at >= created_at, and an Item
      // created through the repository takes created_at from the database's CURRENT_TIMESTAMP
      // rather than from this file's fixed `now`. Deactivate at the real present instant so the
      // test cannot expire as wall-clock time passes the fixture date.
      await repository.setDeactivatedAt(itemId, new Date());

      const afterDeactivation =
        await repository.findActiveItemsForPicker(warehouseId);
      expect(afterDeactivation.map((item) => item.id)).not.toContain(itemId);

      // The SKU stays taken: a second Item cannot reuse it even though the first is inactive.
      await expect(
        repository.createItem({
          id: randomUUID(),
          warehouseId,
          sku: 'TEST-SKU-DEACTIVATE',
          description: 'A different Item attempting to reuse the SKU',
          unitOfMeasure: 'each',
        }),
      ).rejects.toThrow();

      // Every Customer Order and Purchase Draft Line that already named the Item stays readable
      // and keeps counting exactly as before.
      const customerOrders = await dataSource.manager
        .getRepository(CustomerOrderEntity)
        .find({ where: { itemId } });
      expect(customerOrders).toHaveLength(1);
      expect(customerOrders[0]).toMatchObject({
        itemId,
        state: 'unfulfilled',
        outstandingQuantity: 10,
      });

      const draftLines = await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .find({ where: { itemId } });
      expect(draftLines).toHaveLength(1);
      expect(draftLines[0]).toMatchObject({ itemId, orderedQuantity: 5 });

      // Reactivation is the same operation inverted.
      await repository.setDeactivatedAt(itemId, null);
      const afterReactivation =
        await repository.findActiveItemsForPicker(warehouseId);
      expect(afterReactivation.map((item) => item.id)).toContain(itemId);
    });
  });
};

const registerCorrectionTests = (): void => {
  describe('correcting description or Unit of Measure leaves every reference naming the same Item (AC-06b)', () => {
    it('updates the description and Unit of Measure without disturbing the Item identity referenced Customer Orders and Purchase Draft Lines carry', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemId = randomUUID();
      await repository.createItem({
        id: itemId,
        warehouseId,
        sku: 'TEST-SKU-CORRECT',
        description: 'Cable reel, 50m',
        unitOfMeasure: 'each',
      });
      await insertCustomerOrder(warehouseId, itemId, userId);
      await insertPurchaseDraftWithLine(warehouseId, itemId, userId);

      await repository.updateItemDetails(itemId, {
        description: 'Cable reel, 50m, black PVC',
        unitOfMeasure: 'coil',
      });

      const item = await dataSource.manager
        .getRepository(ItemEntity)
        .findOneBy({ id: itemId });
      expect(item).toMatchObject({
        description: 'Cable reel, 50m, black PVC',
        unitOfMeasure: 'coil',
        sku: 'TEST-SKU-CORRECT',
      });

      // Every record naming the Item still names the same Item — its id, and therefore the
      // reference, is unaffected by a description/Unit of Measure correction.
      const customerOrders = await dataSource.manager
        .getRepository(CustomerOrderEntity)
        .find({ where: { itemId } });
      expect(customerOrders).toHaveLength(1);
      expect(customerOrders[0].itemId).toBe(itemId);

      const draftLines = await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .find({ where: { itemId } });
      expect(draftLines).toHaveLength(1);
      expect(draftLines[0].itemId).toBe(itemId);
    });
  });
};

const registerItemsWithOnHandAndLatestReasonTests = (): void => {
  describe("the Warehouse's Items with on-hand and the latest adjustment reason", () => {
    // The single method under test, spied at the PostgreSQL round-trip level (as
    // `registerIsNamedByDemandOrDraftTests` does for `isNamedByDemandOrDraft`) so an
    // implementation that reads the latest reason with a per-Item follow-up query (an N+1) fails
    // this test even though it would return the same rows —
    // creating-a-server-repository.md forbids "retrieving records separately and joining or
    // filtering them in application memory".
    const withQueryCount = async <T>(
      run: () => Promise<T>,
    ): Promise<{ result: T; queryCount: number }> => {
      const spy = jest.spyOn(PostgresQueryRunner.prototype, 'query');
      const before = spy.mock.calls.length;
      const result = await run();
      const queryCount = spy.mock.calls.length - before;
      spy.mockRestore();
      return { result, queryCount };
    };

    it('reports an Item with no adjustment yet with its on-hand figure and no reason', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const itemId = randomUUID();
      await repository.createItem({
        id: itemId,
        warehouseId,
        sku: 'TEST-SKU-NO-ADJUSTMENT',
        description: 'Cable reel, 50m',
        unitOfMeasure: 'each',
      });

      const rows =
        await repository.findItemsWithOnHandAndLatestReason(warehouseId);

      const row = rows.find((entry) => entry.id === itemId);
      expect(row).toMatchObject({
        onHandQuantity: 0,
        latestAdjustmentReason: null,
      });
    });

    it('reports the LATEST adjustment reason, not an arbitrary one, when several exist', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemId = randomUUID();
      await repository.createItem({
        id: itemId,
        warehouseId,
        sku: 'TEST-SKU-SEVERAL-ADJUSTMENTS',
        description: 'Cable reel, 100m',
        unitOfMeasure: 'each',
      });
      await insertAdjustment(
        itemId,
        warehouseId,
        userId,
        'Initial count',
        new Date(now.getTime() - 60_000),
      );
      await insertAdjustment(
        itemId,
        warehouseId,
        userId,
        'Cycle count correction',
        now,
      );

      const rows =
        await repository.findItemsWithOnHandAndLatestReason(warehouseId);

      const row = rows.find((entry) => entry.id === itemId);
      expect(row?.latestAdjustmentReason).toBe('Cycle count correction');
    });

    it("is scoped to the acting Warehouse and never leaks another Warehouse's Items", async () => {
      const workspaceId = await seedWorkspace();
      const warehouseOneId = await seedWarehouse(workspaceId);
      const warehouseTwoId = await seedWarehouse(workspaceId);
      const itemInWarehouseTwoId = randomUUID();
      await repository.createItem({
        id: itemInWarehouseTwoId,
        warehouseId: warehouseTwoId,
        sku: 'TEST-SKU-OTHER-WAREHOUSE',
        description: 'An Item of the other Warehouse',
        unitOfMeasure: 'each',
      });

      const rows =
        await repository.findItemsWithOnHandAndLatestReason(warehouseOneId);

      expect(rows.map((row) => row.id)).not.toContain(itemInWarehouseTwoId);
    });

    it('reads every Item of the Warehouse with its latest reason in exactly one query, regardless of how many Items or adjustments exist', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemOneId = randomUUID();
      const itemTwoId = randomUUID();
      await repository.createItem({
        id: itemOneId,
        warehouseId,
        sku: 'TEST-SKU-ROUNDTRIP-1',
        description: 'Cable reel, 50m',
        unitOfMeasure: 'each',
      });
      await repository.createItem({
        id: itemTwoId,
        warehouseId,
        sku: 'TEST-SKU-ROUNDTRIP-2',
        description: 'Cable reel, 100m',
        unitOfMeasure: 'each',
      });
      await insertAdjustment(itemOneId, warehouseId, userId, 'First', now);
      await insertAdjustment(itemTwoId, warehouseId, userId, 'Second', now);

      const { result, queryCount } = await withQueryCount(() =>
        repository.findItemsWithOnHandAndLatestReason(warehouseId),
      );

      expect(result.map((row) => row.id).sort()).toEqual(
        [itemOneId, itemTwoId].sort(),
      );
      expect(queryCount).toBe(1);
    });
  });
};

describeIntegration('ItemCatalogueRepository', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE item_stock_adjustments, purchase_draft_lines, purchase_drafts, customer_orders, items, warehouse_memberships, roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  registerIsNamedByDemandOrDraftTests();
  registerSkuUniquenessTests();
  registerDeactivationTests();
  registerCorrectionTests();
  registerItemsWithOnHandAndLatestReasonTests();
});
