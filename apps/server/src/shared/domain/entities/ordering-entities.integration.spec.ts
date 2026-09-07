import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { ArrivalAllocationEntity } from 'shared/domain/entities/arrival-allocation.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { DemandSnapshotEntryEntity } from 'shared/domain/entities/demand-snapshot-entry.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { ItemStockAdjustmentEntity } from 'shared/domain/entities/item-stock-adjustment.entity';
import { PackagingTypeEntity } from 'shared/domain/entities/packaging-type.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
import { QueryFailedError } from 'typeorm';

/**
 * `ordering-entities.integration.spec.ts` is the T3 RED for
 * `docs/features/ordering/tasks/ordering-persistence-entities.md`: it proves
 * the nine shared persistence entities round-trip against the schema T1
 * created, that the composite Warehouse reference refuses a cross-Warehouse
 * line and link (AC-03, AC-11), and it carries the three constraint proofs
 * relocated here from T1 (AC-07, AC-07a, AC-09, AC-13) because T1 is a
 * migration and `apps/server/AGENTS.md` forbids tests for migrations.
 */
const now = new Date('2026-08-26T09:00:00.000Z');
const futureNeededBy = '2099-01-01';

/**
 * `accounts.user_id` / `users.account_id` form a deferred circular FK pair,
 * so both inserts must run inside one transaction, matching the pattern in
 * every other integration spec under this directory.
 */
const seedUser = async (
  workspaceId: string,
  normalizedEmail: string,
): Promise<string> => {
  const userId = randomUUID();
  await dataSource.transaction(async (manager) => {
    await manager.getRepository(AccountEntity).insert({
      id: userId,
      userId,
      normalizedEmail,
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

interface SeededWarehouse {
  readonly workspaceId: string;
  readonly warehouseId: string;
  readonly userId: string;
}

const seedWarehouse = async (
  normalizedEmail: string,
): Promise<SeededWarehouse> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  const warehouse = buildWarehouse({ workspaceId: workspace.id! });
  await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);
  const userId = await seedUser(workspace.id!, normalizedEmail);

  return { workspaceId: workspace.id!, warehouseId: warehouse.id!, userId };
};

const buildItem = (
  overrides: Partial<ItemEntity> & Pick<ItemEntity, 'warehouseId'>,
): ItemEntity => ({
  id: randomUUID(),
  sku: `SKU-${randomUUID()}`,
  description: 'A round-tripped Item',
  unitOfMeasure: 'ea',
  onHandQuantity: 0,
  deactivatedAt: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const buildCustomerOrder = (
  overrides: Partial<CustomerOrderEntity> &
    Pick<CustomerOrderEntity, 'warehouseId' | 'itemId' | 'recordedByUserId'>,
): CustomerOrderEntity => ({
  id: randomUUID(),
  customerId: null,
  customerDeliveryAddressId: null,
  customerName: 'Buyer One',
  quantity: 3,
  outstandingQuantity: 3,
  neededBy: futureNeededBy,
  state: 'unfulfilled',
  cancellationReason: null,
  cancelledByUserId: null,
  cancelledAt: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const buildPurchaseDraft = (
  overrides: Partial<PurchaseDraftEntity> &
    Pick<PurchaseDraftEntity, 'warehouseId' | 'createdByUserId'>,
): PurchaseDraftEntity => ({
  id: randomUUID(),
  state: 'draft',
  expectedArrivalDate: null,
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
  ...overrides,
});

const buildPurchaseDraftLine = (
  overrides: Partial<PurchaseDraftLineEntity> &
    Pick<PurchaseDraftLineEntity, 'purchaseDraftId' | 'warehouseId' | 'itemId'>,
): PurchaseDraftLineEntity => ({
  id: randomUUID(),
  orderedQuantity: 10,
  packagingTypeId: null,
  valueAddingNote: null,
  deliveryMode: 'via_warehouse',
  customerDeliveryAddressId: null,
  frozenDeliveryAddressText: null,
  frozenAccessNotes: null,
  frozenCustomerName: null,
  endingQuantity: null,
  endingKind: null,
  endingRecordedByUserId: null,
  endingRecordedAt: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const buildPurchaseDraftLineLink = (
  overrides: Partial<PurchaseDraftLineLinkEntity> &
    Pick<
      PurchaseDraftLineLinkEntity,
      | 'purchaseDraftLineId'
      | 'purchaseDraftId'
      | 'warehouseId'
      | 'customerOrderId'
    >,
): PurchaseDraftLineLinkEntity => ({
  id: randomUUID(),
  statedQuantity: 2,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const buildDemandSnapshotEntry = (
  overrides: Pick<
    DemandSnapshotEntryEntity,
    'purchaseDraftLineLinkId' | 'purchaseDraftLineId' | 'customerOrderId'
  >,
): DemandSnapshotEntryEntity => ({
  capturedQuantity: 3,
  capturedNeededBy: futureNeededBy,
  capturedState: 'unfulfilled',
  capturedCustomerDeliveryAddressId: null,
  capturedDeliveryAddressText: null,
  createdAt: now,
  ...overrides,
});

/** Assembles one valid line-link pair (and its owning draft, line, item and
 * Customer Order) inside `warehouse`, returning every id a Demand Snapshot
 * or Allocation round-trip needs. */
const seedLinkedPurchaseDraftLine = async (
  seeded: SeededWarehouse,
): Promise<{
  readonly itemId: string;
  readonly customerOrderId: string;
  readonly purchaseDraftId: string;
  readonly purchaseDraftLineId: string;
  readonly purchaseDraftLineLinkId: string;
}> => {
  const item = buildItem({ warehouseId: seeded.warehouseId });
  await dataSource.manager.getRepository(ItemEntity).insert(item);

  const customerOrder = buildCustomerOrder({
    warehouseId: seeded.warehouseId,
    itemId: item.id,
    recordedByUserId: seeded.userId,
  });
  await dataSource.manager
    .getRepository(CustomerOrderEntity)
    .insert(customerOrder);

  const draft = buildPurchaseDraft({
    warehouseId: seeded.warehouseId,
    createdByUserId: seeded.userId,
  });
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert(draft);

  const line = buildPurchaseDraftLine({
    purchaseDraftId: draft.id,
    warehouseId: seeded.warehouseId,
    itemId: item.id,
  });
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert(line);

  const link = buildPurchaseDraftLineLink({
    purchaseDraftLineId: line.id,
    purchaseDraftId: draft.id,
    warehouseId: seeded.warehouseId,
    customerOrderId: customerOrder.id,
  });
  await dataSource.manager
    .getRepository(PurchaseDraftLineLinkEntity)
    .insert(link);

  return {
    itemId: item.id,
    customerOrderId: customerOrder.id,
    purchaseDraftId: draft.id,
    purchaseDraftLineId: line.id,
    purchaseDraftLineLinkId: link.id,
  };
};

const describeRoundTrips = (): void => {
  describe('column mapping against the promoted schema (round-trip)', () => {
    it('persists and reads back an ItemEntity', async () => {
      const seeded = await seedWarehouse('item-owner@example.test');
      const item = buildItem({
        warehouseId: seeded.warehouseId,
        onHandQuantity: 7,
      });

      await dataSource.manager.getRepository(ItemEntity).insert(item);
      const found = await dataSource.manager
        .getRepository(ItemEntity)
        .findOneByOrFail({ id: item.id });

      expect(found).toMatchObject({
        warehouseId: seeded.warehouseId,
        sku: item.sku,
        description: 'A round-tripped Item',
        unitOfMeasure: 'ea',
        onHandQuantity: 7,
        deactivatedAt: null,
      });
    });

    it('persists and reads back an ItemStockAdjustmentEntity', async () => {
      const seeded = await seedWarehouse('adjuster@example.test');
      const item = buildItem({ warehouseId: seeded.warehouseId });
      await dataSource.manager.getRepository(ItemEntity).insert(item);

      const adjustment: ItemStockAdjustmentEntity = {
        id: randomUUID(),
        itemId: item.id,
        warehouseId: seeded.warehouseId,
        countedQuantity: 12,
        reason: 'Physical recount',
        adjustedByUserId: seeded.userId,
        createdAt: now,
      };
      await dataSource.manager
        .getRepository(ItemStockAdjustmentEntity)
        .insert(adjustment);

      const found = await dataSource.manager
        .getRepository(ItemStockAdjustmentEntity)
        .findOneByOrFail({ id: adjustment.id });

      expect(found).toMatchObject({
        itemId: item.id,
        warehouseId: seeded.warehouseId,
        countedQuantity: 12,
        reason: 'Physical recount',
        adjustedByUserId: seeded.userId,
      });
    });

    it('persists and reads back a CustomerOrderEntity', async () => {
      const seeded = await seedWarehouse('demand-recorder@example.test');
      const item = buildItem({ warehouseId: seeded.warehouseId });
      await dataSource.manager.getRepository(ItemEntity).insert(item);

      const order = buildCustomerOrder({
        warehouseId: seeded.warehouseId,
        itemId: item.id,
        recordedByUserId: seeded.userId,
      });
      await dataSource.manager.getRepository(CustomerOrderEntity).insert(order);

      const found = await dataSource.manager
        .getRepository(CustomerOrderEntity)
        .findOneByOrFail({ id: order.id });

      expect(found).toMatchObject({
        warehouseId: seeded.warehouseId,
        itemId: item.id,
        customerName: 'Buyer One',
        quantity: 3,
        outstandingQuantity: 3,
        state: 'unfulfilled',
        recordedByUserId: seeded.userId,
      });
    });

    it('reads back the migration-seeded PackagingTypeEntity catalogue', async () => {
      const found = await dataSource.manager
        .getRepository(PackagingTypeEntity)
        .findOneByOrFail({ id: 'cartons' });

      expect(found).toMatchObject({ id: 'cartons', label: 'Cartons' });
    });

    it('persists and reads back a PurchaseDraftEntity', async () => {
      const seeded = await seedWarehouse('draft-creator@example.test');
      const draft = buildPurchaseDraft({
        warehouseId: seeded.warehouseId,
        createdByUserId: seeded.userId,
      });

      await dataSource.manager.getRepository(PurchaseDraftEntity).insert(draft);
      const found = await dataSource.manager
        .getRepository(PurchaseDraftEntity)
        .findOneByOrFail({ id: draft.id });

      expect(found).toMatchObject({
        warehouseId: seeded.warehouseId,
        state: 'draft',
        createdByUserId: seeded.userId,
        readiedAt: null,
        closedAt: null,
        arrivalConfirmedAt: null,
        discardedAt: null,
      });
    });

    it('persists and reads back a PurchaseDraftLineEntity', async () => {
      const seeded = await seedWarehouse('draft-line-owner@example.test');
      const item = buildItem({ warehouseId: seeded.warehouseId });
      await dataSource.manager.getRepository(ItemEntity).insert(item);
      const draft = buildPurchaseDraft({
        warehouseId: seeded.warehouseId,
        createdByUserId: seeded.userId,
      });
      await dataSource.manager.getRepository(PurchaseDraftEntity).insert(draft);

      const line = buildPurchaseDraftLine({
        purchaseDraftId: draft.id,
        warehouseId: seeded.warehouseId,
        itemId: item.id,
        orderedQuantity: 25,
      });
      await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .insert(line);

      const found = await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .findOneByOrFail({ id: line.id });

      expect(found).toMatchObject({
        purchaseDraftId: draft.id,
        warehouseId: seeded.warehouseId,
        itemId: item.id,
        orderedQuantity: 25,
        packagingTypeId: null,
      });
    });

    it('persists and reads back a PurchaseDraftLineLinkEntity', async () => {
      const seeded = await seedWarehouse('draft-link-owner@example.test');
      const {
        purchaseDraftLineLinkId,
        purchaseDraftLineId,
        purchaseDraftId,
        customerOrderId,
      } = await seedLinkedPurchaseDraftLine(seeded);

      const found = await dataSource.manager
        .getRepository(PurchaseDraftLineLinkEntity)
        .findOneByOrFail({ id: purchaseDraftLineLinkId });

      expect(found).toMatchObject({
        purchaseDraftLineId,
        purchaseDraftId,
        warehouseId: seeded.warehouseId,
        customerOrderId,
        statedQuantity: 2,
      });
    });

    it('persists and reads back a DemandSnapshotEntryEntity', async () => {
      const seeded = await seedWarehouse('snapshot-owner@example.test');
      const { purchaseDraftLineLinkId, purchaseDraftLineId, customerOrderId } =
        await seedLinkedPurchaseDraftLine(seeded);

      const snapshot = buildDemandSnapshotEntry({
        purchaseDraftLineLinkId,
        purchaseDraftLineId,
        customerOrderId,
      });
      await dataSource.manager
        .getRepository(DemandSnapshotEntryEntity)
        .insert(snapshot);

      const found = await dataSource.manager
        .getRepository(DemandSnapshotEntryEntity)
        .findOneByOrFail({ purchaseDraftLineLinkId });

      expect(found).toMatchObject({
        purchaseDraftLineId,
        customerOrderId,
        capturedQuantity: 3,
        capturedState: 'unfulfilled',
      });
    });

    it('persists and reads back an ArrivalAllocationEntity', async () => {
      const seeded = await seedWarehouse('allocation-owner@example.test');
      const { purchaseDraftLineLinkId, purchaseDraftLineId, customerOrderId } =
        await seedLinkedPurchaseDraftLine(seeded);

      const allocation: ArrivalAllocationEntity = {
        purchaseDraftLineLinkId,
        purchaseDraftLineId,
        customerOrderId,
        allocatedQuantity: 2,
        allocatedByUserId: seeded.userId,
        createdAt: now,
      };
      await dataSource.manager
        .getRepository(ArrivalAllocationEntity)
        .insert(allocation);

      const found = await dataSource.manager
        .getRepository(ArrivalAllocationEntity)
        .findOneByOrFail({ purchaseDraftLineLinkId });

      expect(found).toMatchObject({
        purchaseDraftLineId,
        customerOrderId,
        allocatedQuantity: 2,
        allocatedByUserId: seeded.userId,
      });
    });
  });
};

const describeCompositeWarehouseReference = (): void => {
  describe('composite Warehouse reference refuses cross-Warehouse targets (AC-03, AC-11)', () => {
    it('refuses a Purchase Draft Line whose Item sits in a different Warehouse', async () => {
      const seededA = await seedWarehouse('line-owner-a@example.test');
      const seededB = await seedWarehouse('line-owner-b@example.test');
      const itemInB = buildItem({ warehouseId: seededB.warehouseId });
      await dataSource.manager.getRepository(ItemEntity).insert(itemInB);
      const draftInA = buildPurchaseDraft({
        warehouseId: seededA.warehouseId,
        createdByUserId: seededA.userId,
      });
      await dataSource.manager
        .getRepository(PurchaseDraftEntity)
        .insert(draftInA);

      const foreignLine = buildPurchaseDraftLine({
        purchaseDraftId: draftInA.id,
        warehouseId: seededA.warehouseId,
        itemId: itemInB.id,
      });

      await expect(
        dataSource.manager
          .getRepository(PurchaseDraftLineEntity)
          .insert(foreignLine),
      ).rejects.toThrow(QueryFailedError);
    });

    it('refuses a Purchase Draft Line Link whose Customer Order sits in a different Warehouse', async () => {
      const seededA = await seedWarehouse('link-owner-a@example.test');
      const seededB = await seedWarehouse('link-owner-b@example.test');
      const { purchaseDraftId, purchaseDraftLineId } =
        await seedLinkedPurchaseDraftLine(seededA);

      const itemInB = buildItem({ warehouseId: seededB.warehouseId });
      await dataSource.manager.getRepository(ItemEntity).insert(itemInB);
      const orderInB = buildCustomerOrder({
        warehouseId: seededB.warehouseId,
        itemId: itemInB.id,
        recordedByUserId: seededB.userId,
      });
      await dataSource.manager
        .getRepository(CustomerOrderEntity)
        .insert(orderInB);

      const foreignLink = buildPurchaseDraftLineLink({
        purchaseDraftLineId,
        purchaseDraftId,
        warehouseId: seededA.warehouseId,
        customerOrderId: orderInB.id,
      });

      await expect(
        dataSource.manager
          .getRepository(PurchaseDraftLineLinkEntity)
          .insert(foreignLink),
      ).rejects.toThrow(QueryFailedError);
    });
  });
};

const describeRelocatedConstraintProofs = (): void => {
  describe('relocated T1 constraint proofs (AC-07, AC-07a, AC-09, AC-13)', () => {
    it('rejects a second Item with the same SKU in the same Warehouse (uq_items_warehouse_sku, 23505)', async () => {
      const seeded = await seedWarehouse('sku-owner@example.test');
      const sku = `SKU-DUP-${randomUUID()}`;
      const first = buildItem({ warehouseId: seeded.warehouseId, sku });
      await dataSource.manager.getRepository(ItemEntity).insert(first);
      const duplicate = buildItem({ warehouseId: seeded.warehouseId, sku });

      const failure: unknown = await dataSource.manager
        .getRepository(ItemEntity)
        .insert(duplicate)
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(QueryFailedError);
      const queryFailure = failure as QueryFailedError & {
        driverError: { code: string };
      };
      expect(queryFailure.driverError.code).toEqual('23505');
      expect(queryFailure.message).toContain('uq_items_warehouse_sku');
    });

    it('accepts the same SKU in a second Warehouse (AC-07a)', async () => {
      const seededA = await seedWarehouse('sku-cross-a@example.test');
      const seededB = await seedWarehouse('sku-cross-b@example.test');
      const sku = `SKU-CROSS-${randomUUID()}`;
      const itemA = buildItem({ warehouseId: seededA.warehouseId, sku });
      const itemB = buildItem({ warehouseId: seededB.warehouseId, sku });

      await dataSource.manager.getRepository(ItemEntity).insert(itemA);
      await dataSource.manager.getRepository(ItemEntity).insert(itemB);

      const found = await dataSource.manager
        .getRepository(ItemEntity)
        .findBy({ sku });
      expect(found).toHaveLength(2);
    });

    it('rejects a negative On-hand Quantity (chk_items_on_hand_quantity_not_negative, 23514)', async () => {
      const seeded = await seedWarehouse('negative-owner@example.test');
      const negative = buildItem({
        warehouseId: seeded.warehouseId,
        onHandQuantity: -1,
      });

      const failure: unknown = await dataSource.manager
        .getRepository(ItemEntity)
        .insert(negative)
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(QueryFailedError);
      const queryFailure = failure as QueryFailedError & {
        driverError: { code: string };
      };
      expect(queryFailure.driverError.code).toEqual('23514');
      expect(queryFailure.message).toContain(
        'chk_items_on_hand_quantity_not_negative',
      );
    });

    it('rejects a fractional On-hand Quantity (invalid_text_representation, 22P02)', async () => {
      const seeded = await seedWarehouse('fractional-owner@example.test');
      const fractional = buildItem({
        warehouseId: seeded.warehouseId,
        onHandQuantity: 1.5,
      });

      const failure: unknown = await dataSource.manager
        .getRepository(ItemEntity)
        .insert(fractional)
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(QueryFailedError);
      const queryFailure = failure as QueryFailedError & {
        driverError: { code: string };
      };
      // Postgres refuses a fractional bound parameter for an `integer`
      // column before any CHECK runs — a whole number is never negotiable
      // (AC-09), it simply never reaches the row.
      expect(queryFailure.driverError.code).toEqual('22P02');
    });

    it('holds exactly the four Packaging Type identifiers (AC-13)', async () => {
      const found = await dataSource.manager
        .getRepository(PackagingTypeEntity)
        .find();

      expect(found.map((row) => row.id).sort()).toEqual([
        'cable_coil',
        'cartons',
        'loose_items',
        'pallets',
      ]);
    });
  });
};

describe('Ordering shared persistence entities', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE arrival_allocations, purchase_draft_demand_snapshots, purchase_draft_line_links, purchase_draft_lines, purchase_drafts, item_stock_adjustments, customer_orders, items, warehouses, sessions, users, accounts, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describeRoundTrips();
  describeCompositeWarehouseReference();
  describeRelocatedConstraintProofs();
});
