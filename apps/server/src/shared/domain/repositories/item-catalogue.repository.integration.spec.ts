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
      // AC-06c — what names the Item, counted by the same conditions `isNamedByDemandOrDraft`
      // enforces the SKU rule with, so the Items table cannot state a figure the correction
      // attempt disagrees with.
      namingCustomerOrderCount: number;
      namingPurchaseDraftLineCount: number;
      latestAdjustmentReason: string | null;
      // AC-08 — "the reason, the acting member, and the time", all three.
      latestAdjustedByUserId: string | null;
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

// AC-06c fixes a SKU "for the life of that item", so a cancelled Customer Order names the Item
// exactly as an Unfulfilled one does — `cancelled` is offered here so the naming counts can be
// exercised against the same rule the enforcement applies.
// `chk_customer_orders_cancellation_attribution` — a cancelled order carries its reason, its member
// and its time; a non-cancelled one carries none of the three.
const insertCustomerOrder = async (
  warehouseId: string,
  itemId: string,
  recordedByUserId: string,
  state: 'unfulfilled' | 'cancelled' = 'unfulfilled',
): Promise<void> => {
  const isCancelled = state === 'cancelled';
  await dataSource.manager.getRepository(CustomerOrderEntity).insert({
    id: randomUUID(),
    warehouseId,
    itemId,
    customerName: 'Buyer One',
    quantity: 10,
    outstandingQuantity: 10,
    neededBy: '2026-09-30',
    state,
    cancellationReason: isCancelled ? 'The customer no longer needs it' : null,
    recordedByUserId,
    cancelledByUserId: isCancelled ? recordedByUserId : null,
    cancelledAt: isCancelled ? now : null,
    createdAt: now,
    updatedAt: now,
  });
};

// A discarded draft's line names the Item too — AC-06d's "keeps its SKU taken so no new Item may
// reuse it" is the same permanence read from the other side.
// `chk_purchase_drafts_discard_attribution` — a Discarded draft carries its member and its time.
const insertPurchaseDraftWithLine = async (
  warehouseId: string,
  itemId: string,
  createdByUserId: string,
  state: 'draft' | 'discarded' = 'draft',
): Promise<void> => {
  const purchaseDraftId = randomUUID();
  const isDiscarded = state === 'discarded';
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id: purchaseDraftId,
    warehouseId,
    state,
    expectedArrivalDate: null,
    createdByUserId,
    readiedByUserId: null,
    readiedAt: null,
    closedByUserId: null,
    closedAt: null,
    closureReason: null,
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
    discardedByUserId: isDiscarded ? createdByUserId : null,
    discardedAt: isDiscarded ? now : null,
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
// `describe`, so the outer `describe` callback stays a short table of contents
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

// AC-06c — the Items table's second description line (`Named by 3 customer orders and 1 draft
// line` / `Nothing names it yet — its SKU is still correctable`, design frame `XIvAZ.png`) is the
// affordance that tells a member whether a SKU correction is still open to them. It is therefore
// only honest while it is counted by **the same** rule `isNamedByDemandOrDraft` enforces, which is
// what every test here pins: each case asserts the two counts *and* the boolean together, so an
// implementation that filtered one of them by order or draft state — showing "nothing names it"
// on an Item whose correction the server would refuse — fails.
const registerNamingCountTests = (): void => {
  describe('what names an Item, counted by the rule the SKU is enforced with (AC-06c)', () => {
    const seedItemNamedBy = async (
      sku: string,
      seed: (
        warehouseId: string,
        itemId: string,
        userId: string,
      ) => Promise<void>,
    ): Promise<{
      warehouseId: string;
      itemId: string;
      namingCustomerOrderCount: number;
      namingPurchaseDraftLineCount: number;
      isNamed: boolean;
    }> => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemId = randomUUID();
      await repository.createItem({
        id: itemId,
        warehouseId,
        sku,
        description: 'Cable reel, 50m',
        unitOfMeasure: 'each',
      });
      await seed(warehouseId, itemId, userId);

      const rows =
        await repository.findItemsWithOnHandAndLatestReason(warehouseId);
      const row = rows.find((entry) => entry.id === itemId);

      return {
        warehouseId,
        itemId,
        namingCustomerOrderCount: row!.namingCustomerOrderCount,
        namingPurchaseDraftLineCount: row!.namingPurchaseDraftLineCount,
        isNamed: await repository.isNamedByDemandOrDraft(itemId),
      };
    };

    it('counts nothing, and permits the SKU correction, while nothing names the Item', async () => {
      const read = await seedItemNamedBy(
        'TEST-SKU-NAMED-BY-NOTHING',
        async () => {},
      );

      expect(read.namingCustomerOrderCount).toBe(0);
      expect(read.namingPurchaseDraftLineCount).toBe(0);
      expect(read.isNamed).toBe(false);
    });

    it('counts each naming Customer Order and each naming Purchase Draft Line separately', async () => {
      const read = await seedItemNamedBy(
        'TEST-SKU-NAMED-BY-BOTH',
        async (warehouseId, itemId, userId) => {
          await insertCustomerOrder(warehouseId, itemId, userId);
          await insertCustomerOrder(warehouseId, itemId, userId);
          await insertCustomerOrder(warehouseId, itemId, userId);
          await insertPurchaseDraftWithLine(warehouseId, itemId, userId);
        },
      );

      // The frame's own sentence: "Named by 3 customer orders and 1 draft line".
      expect(read.namingCustomerOrderCount).toBe(3);
      expect(read.namingPurchaseDraftLineCount).toBe(1);
      expect(read.isNamed).toBe(true);
    });

    // The half that would break silently: AC-06c fixes the SKU "for the life of that item", so a
    // cancelled order and a discarded draft still name it. Were the counts filtered by state and
    // the enforcement not, an Item would read `Nothing names it yet — its SKU is still correctable`
    // and then have its correction refused.
    it('counts a cancelled Customer Order and a discarded draft line exactly as the enforcement does', async () => {
      const read = await seedItemNamedBy(
        'TEST-SKU-NAMED-BY-ENDED',
        async (warehouseId, itemId, userId) => {
          await insertCustomerOrder(warehouseId, itemId, userId, 'cancelled');
          await insertPurchaseDraftWithLine(
            warehouseId,
            itemId,
            userId,
            'discarded',
          );
        },
      );

      expect(read.namingCustomerOrderCount).toBe(1);
      expect(read.namingPurchaseDraftLineCount).toBe(1);
      expect(read.isNamed).toBe(true);
    });

    // Another Warehouse's Item is a different Item that happens to share a SKU (AC-07a); what
    // names it is counted against it alone.
    it("never counts another Item's Customer Orders or draft lines", async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const countedItemId = randomUUID();
      const otherItemId = randomUUID();
      await repository.createItem({
        id: countedItemId,
        warehouseId,
        sku: 'TEST-SKU-NAMED-COUNTED',
        description: 'Cable reel, 50m',
        unitOfMeasure: 'each',
      });
      await repository.createItem({
        id: otherItemId,
        warehouseId,
        sku: 'TEST-SKU-NAMED-OTHER',
        description: 'Cable reel, 100m',
        unitOfMeasure: 'each',
      });
      await insertCustomerOrder(warehouseId, otherItemId, userId);
      await insertPurchaseDraftWithLine(warehouseId, otherItemId, userId);

      const rows =
        await repository.findItemsWithOnHandAndLatestReason(warehouseId);

      expect(rows.find((row) => row.id === countedItemId)).toMatchObject({
        namingCustomerOrderCount: 0,
        namingPurchaseDraftLineCount: 0,
      });
      expect(rows.find((row) => row.id === otherItemId)).toMatchObject({
        namingCustomerOrderCount: 1,
        namingPurchaseDraftLineCount: 1,
      });
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
        // The Items table renders `nothing recorded yet` from this: no reason, no member, no time
        // — never a member id left standing beside an absent count.
        latestAdjustedByUserId: null,
      });
    });

    // AC-08 — "records that count as the Item's On-hand Quantity, together with the reason, the
    // acting member, and the time". The Items table states all three on one line
    // (`24 Aug · cycle count · by you`), which it cannot do while the read path carries two of
    // them; the member must come from the same latest row as the reason, not from an arbitrary
    // earlier adjustment.
    it('reports the acting member of the LATEST adjustment, from the same row as its reason (AC-08)', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const earlierMemberId = await seedUser(workspaceId);
      const latestMemberId = await seedUser(workspaceId);
      const itemId = randomUUID();
      await repository.createItem({
        id: itemId,
        warehouseId,
        sku: 'TEST-SKU-ADJUSTMENT-MEMBER',
        description: 'Cable reel, 50m',
        unitOfMeasure: 'each',
      });
      await insertAdjustment(
        itemId,
        warehouseId,
        earlierMemberId,
        'Initial count',
        new Date(now.getTime() - 60_000),
      );
      await insertAdjustment(
        itemId,
        warehouseId,
        latestMemberId,
        'Cycle count correction',
        now,
      );

      const rows =
        await repository.findItemsWithOnHandAndLatestReason(warehouseId);

      const row = rows.find((entry) => entry.id === itemId);
      expect(row).toMatchObject({
        latestAdjustmentReason: 'Cycle count correction',
        latestAdjustedByUserId: latestMemberId,
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

    it('reads every Item of the Warehouse with its latest reason and what names it in exactly one query, regardless of how many Items, adjustments, orders or draft lines exist', async () => {
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
      // AC-06c's naming counts are correlated subqueries of the same `SELECT`, so seeding what
      // names an Item must not add a round trip either.
      await insertCustomerOrder(warehouseId, itemOneId, userId);
      await insertPurchaseDraftWithLine(warehouseId, itemTwoId, userId);

      const { result, queryCount } = await withQueryCount(() =>
        repository.findItemsWithOnHandAndLatestReason(warehouseId),
      );

      expect(result.map((row) => row.id).sort()).toEqual(
        [itemOneId, itemTwoId].sort(),
      );
      expect(
        result.find((row) => row.id === itemOneId)?.namingCustomerOrderCount,
      ).toBe(1);
      expect(
        result.find((row) => row.id === itemTwoId)
          ?.namingPurchaseDraftLineCount,
      ).toBe(1);
      expect(queryCount).toBe(1);
    });
  });
};

describe('ItemCatalogueRepository', () => {
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
  registerNamingCountTests();
  registerSkuUniquenessTests();
  registerDeactivationTests();
  registerCorrectionTests();
  registerItemsWithOnHandAndLatestReasonTests();
});
