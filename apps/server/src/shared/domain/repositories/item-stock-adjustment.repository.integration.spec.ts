import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { ItemStockAdjustmentEntity } from 'shared/domain/entities/item-stock-adjustment.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
// `ItemStockAdjustmentRepository` does not exist yet (T6) — this is the RED for AC-08's
// persistence half and for the atomicity `sad.md` §6.3 requires: "the Item's new On-hand Quantity
// **and** an adjustment row carrying the count, the reason, the acting member and the time ...
// the pair is atomic". Atomicity is a property of the pair being ONE repository operation inside
// the caller's transaction, which is exactly what a mid-way failure has to prove.
import { ItemStockAdjustmentRepository } from 'shared/domain/repositories/item-stock-adjustment.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-26T09:45:00.000Z');
const later = new Date('2026-08-26T11:15:00.000Z');

// The shape this RED step expects the implementer to expose (data-model.md
// `item_stock_adjustments`, tasks/on-hand-adjustment.md). Cast through this interface because the
// module does not exist yet.
interface RecordOnHandAdjustmentInput {
  readonly adjustmentId: string;
  readonly itemId: string;
  readonly warehouseId: string;
  readonly countedQuantity: number;
  readonly reason: string;
  readonly adjustedByUserId: string;
  readonly adjustedAt: Date;
}

interface ItemStockAdjustmentRepositoryContract {
  recordAdjustment(input: RecordOnHandAdjustmentInput): Promise<void>;
}

const repository = new ItemStockAdjustmentRepository(
  dataSource,
) as unknown as ItemStockAdjustmentRepositoryContract;

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

const seed = async (onHandQuantity = 0): Promise<Seeded> => {
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
    onHandQuantity,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return { warehouseId: warehouse.id!, userId, itemId };
};

const readItem = (itemId: string): Promise<ItemEntity | null> =>
  dataSource.manager.getRepository(ItemEntity).findOneBy({ id: itemId });

const readAdjustments = (
  itemId: string,
): Promise<ItemStockAdjustmentEntity[]> =>
  dataSource.manager
    .getRepository(ItemStockAdjustmentEntity)
    .find({ where: { itemId }, order: { createdAt: 'ASC' } });

describeIntegration('ItemStockAdjustmentRepository', () => {
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

  // AC-08 — the counted figure becomes the Item's On-hand Quantity, and the adjustment row carries
  // the count, the reason, the acting member and the time.
  it('writes the Item figure and the adjustment row together', async () => {
    const { warehouseId, userId, itemId } = await seed();
    const adjustmentId = randomUUID();

    await transactions.executeInTransaction({}, () =>
      repository.recordAdjustment({
        adjustmentId,
        itemId,
        warehouseId,
        countedQuantity: 12,
        reason: 'Counted after the cancelled collection',
        adjustedByUserId: userId,
        adjustedAt: now,
      }),
    );

    expect(await readItem(itemId)).toMatchObject({ onHandQuantity: 12 });
    expect(await readAdjustments(itemId)).toEqual([
      expect.objectContaining({
        id: adjustmentId,
        itemId,
        warehouseId,
        countedQuantity: 12,
        reason: 'Counted after the cancelled collection',
        adjustedByUserId: userId,
        createdAt: now,
      }),
    ]);
  });

  // sad.md §6.3 — "the pair is atomic". A failure raised *after* the operation returned, but before
  // the caller's transaction commits, must leave neither half behind.
  it('leaves neither half behind when the transaction fails after the write', async () => {
    const { warehouseId, userId, itemId } = await seed(4);

    await expect(
      transactions.executeInTransaction({}, async () => {
        await repository.recordAdjustment({
          adjustmentId: randomUUID(),
          itemId,
          warehouseId,
          countedQuantity: 12,
          reason: 'Counted after the cancelled collection',
          adjustedByUserId: userId,
          adjustedAt: now,
        });
        throw new Error('injected mid-way failure');
      }),
    ).rejects.toThrow('injected mid-way failure');

    expect(await readItem(itemId)).toMatchObject({ onHandQuantity: 4 });
    expect(await readAdjustments(itemId)).toEqual([]);
  });

  // The same atomicity from the other side: when the history row itself cannot be written — here an
  // acting member `item_stock_adjustments.adjusted_by_user_id` does not reference — the Item's
  // figure must not have moved either. This is the mid-way failure the task's DoD names.
  it('leaves the figure untouched when the adjustment row cannot be written', async () => {
    const { warehouseId, itemId } = await seed(4);

    await expect(
      transactions.executeInTransaction({}, () =>
        repository.recordAdjustment({
          adjustmentId: randomUUID(),
          itemId,
          warehouseId,
          countedQuantity: 12,
          reason: 'Counted after the cancelled collection',
          adjustedByUserId: randomUUID(),
          adjustedAt: now,
        }),
      ),
    ).rejects.toBeDefined();

    expect(await readItem(itemId)).toMatchObject({ onHandQuantity: 4 });
    expect(await readAdjustments(itemId)).toEqual([]);
  });

  // data-model.md `item_stock_adjustments` — "Append-only history. The row is written once and
  // never updated". A second count adds a second row; the first row is exactly as it was.
  it('appends each further count instead of rewriting the history', async () => {
    const { warehouseId, userId, itemId } = await seed();
    const firstAdjustmentId = randomUUID();
    const secondAdjustmentId = randomUUID();

    await transactions.executeInTransaction({}, () =>
      repository.recordAdjustment({
        adjustmentId: firstAdjustmentId,
        itemId,
        warehouseId,
        countedQuantity: 12,
        reason: 'Counted after the cancelled collection',
        adjustedByUserId: userId,
        adjustedAt: now,
      }),
    );
    await transactions.executeInTransaction({}, () =>
      repository.recordAdjustment({
        adjustmentId: secondAdjustmentId,
        itemId,
        warehouseId,
        countedQuantity: 5,
        reason: 'Recounted with the supervisor',
        adjustedByUserId: userId,
        adjustedAt: later,
      }),
    );

    const history = await readAdjustments(itemId);
    expect(history.map((row) => row.id)).toEqual([
      firstAdjustmentId,
      secondAdjustmentId,
    ]);
    expect(history[0]).toMatchObject({
      countedQuantity: 12,
      reason: 'Counted after the cancelled collection',
      createdAt: now,
    });

    // CONTEXT.md §Invariants — the figure is **set to the count**, never accumulated: two counts of
    // 12 and 5 leave 5 on hand, not 17.
    expect(await readItem(itemId)).toMatchObject({ onHandQuantity: 5 });
  });
});
