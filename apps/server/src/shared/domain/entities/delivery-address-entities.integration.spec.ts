import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source.js';
import { AccountEntity } from 'shared/domain/entities/account.entity.js';
import { CustomerEntity } from 'shared/domain/entities/customer.entity.js';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity.js';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity.js';
import { DemandSnapshotEntryEntity } from 'shared/domain/entities/demand-snapshot-entry.entity.js';
import { ItemEntity } from 'shared/domain/entities/item.entity.js';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity.js';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity.js';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity.js';
import { UserEntity } from 'shared/domain/entities/user.entity.js';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity.js';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity.js';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories.js';
import { QueryFailedError } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * The RED for T4 —
 * `docs/features/delivery-addresses/tasks/delivery-persistence-entities.md`.
 *
 * T1 and T2 proved the *schema* through raw SQL, because the entities did not
 * exist yet. This spec proves the *entities*: that `CustomerEntity` and
 * `CustomerDeliveryAddressEntity` map to the two relations T1 created, and that
 * `CustomerOrderEntity`, `PurchaseDraftLineEntity`,
 * `DemandSnapshotEntryEntity` and `WarehouseEntity` carry the columns T2 added
 * — every one of them written and read back through TypeORM rather than SQL,
 * which is the only thing that can fail if a column name, a nullability or a
 * type on an entity disagrees with the migrated relation.
 *
 * Covers AC-01, AC-04, AC-11, AC-16, AC-18 and AC-19.
 */
const now = new Date('2026-09-03T09:00:00.000Z');
const futureNeededBy = '2099-01-01';

interface SeededWarehouse {
  readonly warehouseId: string;
  readonly userId: string;
  readonly itemId: string;
}

interface SeededCustomer {
  readonly customerId: string;
  readonly mainAddressId: string;
}

/**
 * `accounts.user_id` / `users.account_id` are a deferred circular FK pair, so
 * both inserts must land in one transaction — the pattern every integration
 * spec under `shared/domain/` already uses.
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

const seedWarehouse = async (
  normalizedEmail: string,
  warehouseOverrides: Partial<WarehouseEntity> = {},
): Promise<SeededWarehouse> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  const warehouse = buildWarehouse({
    workspaceId: workspace.id!,
    ...warehouseOverrides,
  });
  await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);
  const userId = await seedUser(workspace.id!, normalizedEmail);

  const itemId = randomUUID();
  await dataSource.manager.getRepository(ItemEntity).insert({
    id: itemId,
    warehouseId: warehouse.id!,
    sku: `SKU-${randomUUID()}`,
    description: 'A round-tripped Item',
    unitOfMeasure: 'ea',
    onHandQuantity: 0,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return { warehouseId: warehouse.id!, userId, itemId };
};

const buildCustomer = (
  overrides: Partial<CustomerEntity> &
    Pick<CustomerEntity, 'warehouseId' | 'recordedByUserId'>,
): CustomerEntity => ({
  id: randomUUID(),
  name: `Acme Manufacturing ${randomUUID()}`,
  deactivatedAt: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const buildDeliveryAddress = (
  overrides: Partial<CustomerDeliveryAddressEntity> &
    Pick<CustomerDeliveryAddressEntity, 'customerId' | 'warehouseId'>,
): CustomerDeliveryAddressEntity => ({
  id: randomUUID(),
  addressText: '12 Dock Road, Riverside',
  accessNotes: null,
  isMain: false,
  deactivatedAt: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

/** A Customer of `seeded`'s Warehouse holding its Main Delivery Address (AC-01). */
const seedCustomer = async (
  seeded: SeededWarehouse,
): Promise<SeededCustomer> => {
  const customer = buildCustomer({
    warehouseId: seeded.warehouseId,
    recordedByUserId: seeded.userId,
  });
  await dataSource.manager.getRepository(CustomerEntity).insert(customer);

  const mainAddress = buildDeliveryAddress({
    customerId: customer.id,
    warehouseId: seeded.warehouseId,
    isMain: true,
  });
  await dataSource.manager
    .getRepository(CustomerDeliveryAddressEntity)
    .insert(mainAddress);

  return { customerId: customer.id, mainAddressId: mainAddress.id };
};

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
  preReceiptConformance: null,
  preReceiptConformanceNote: null,
  frozenCustomerName: null,
  endingQuantity: null,
  endingKind: null,
  endingRecordedByUserId: null,
  endingRecordedAt: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const seedPurchaseDraft = async (seeded: SeededWarehouse): Promise<string> => {
  const draftId = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id: draftId,
    warehouseId: seeded.warehouseId,
    state: 'draft',
    expectedArrivalDate: null,
    createdByUserId: seeded.userId,
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

  return draftId;
};

const describeNewEntityRoundTrips = (): void => {
  describe('the two new entities map to the relations T1 created', () => {
    it('persists and reads back a CustomerEntity (AC-01)', async () => {
      const seeded = await seedWarehouse('customer-owner@example.test');
      const customer = buildCustomer({
        warehouseId: seeded.warehouseId,
        recordedByUserId: seeded.userId,
        name: 'Acme Manufacturing',
      });

      await dataSource.manager.getRepository(CustomerEntity).insert(customer);
      const found = await dataSource.manager
        .getRepository(CustomerEntity)
        .findOneByOrFail({ id: customer.id });

      expect(found).toMatchObject({
        warehouseId: seeded.warehouseId,
        name: 'Acme Manufacturing',
        deactivatedAt: null,
        recordedByUserId: seeded.userId,
      });
    });

    it('persists and reads back a CustomerDeliveryAddressEntity (AC-01, AC-04)', async () => {
      const seeded = await seedWarehouse('address-owner@example.test');
      const { customerId } = await seedCustomer(seeded);

      const address = buildDeliveryAddress({
        customerId,
        warehouseId: seeded.warehouseId,
        addressText: '5 Quay Street, Harbourside',
        accessNotes: 'Gate code 4417, deliveries before 16:00',
      });
      await dataSource.manager
        .getRepository(CustomerDeliveryAddressEntity)
        .insert(address);

      const found = await dataSource.manager
        .getRepository(CustomerDeliveryAddressEntity)
        .findOneByOrFail({ id: address.id });

      expect(found).toMatchObject({
        customerId,
        warehouseId: seeded.warehouseId,
        addressText: '5 Quay Street, Harbourside',
        accessNotes: 'Gate code 4417, deliveries before 16:00',
        isMain: false,
        deactivatedAt: null,
      });
    });

    it("carries the warehouse_id its ownership rule needs: an address of another Warehouse's Customer is refused (AC-12)", async () => {
      const seededA = await seedWarehouse('address-cross-a@example.test');
      const seededB = await seedWarehouse('address-cross-b@example.test');
      const { customerId } = await seedCustomer(seededA);

      const foreignAddress = buildDeliveryAddress({
        customerId,
        warehouseId: seededB.warehouseId,
      });

      await expect(
        dataSource.manager
          .getRepository(CustomerDeliveryAddressEntity)
          .insert(foreignAddress),
      ).rejects.toThrow(QueryFailedError);
    });
  });
};

const describeChangedEntityRoundTrips = (): void => {
  describe('the four shipped entities carry the columns T2 added', () => {
    it('persists and reads back a WarehouseEntity holding its own Delivery Address (AC-10)', async () => {
      const seeded = await seedWarehouse('warehouse-address@example.test', {
        deliveryAddressText: '1 Depot Lane, Northfield',
        deliveryAccessNotes: 'Ring the bell at the goods door',
      });

      const found = await dataSource.manager
        .getRepository(WarehouseEntity)
        .findOneByOrFail({ id: seeded.warehouseId });

      expect(found).toMatchObject({
        deliveryAddressText: '1 Depot Lane, Northfield',
        deliveryAccessNotes: 'Ring the bell at the goods door',
      });
    });

    it('persists and reads back a CustomerOrderEntity naming a Customer and one of its Delivery Addresses (AC-11)', async () => {
      const seeded = await seedWarehouse('order-customer@example.test');
      const { customerId, mainAddressId } = await seedCustomer(seeded);

      const order = buildCustomerOrder({
        warehouseId: seeded.warehouseId,
        itemId: seeded.itemId,
        recordedByUserId: seeded.userId,
        customerId,
        customerDeliveryAddressId: mainAddressId,
        customerName: null,
      });
      await dataSource.manager.getRepository(CustomerOrderEntity).insert(order);

      const found = await dataSource.manager
        .getRepository(CustomerOrderEntity)
        .findOneByOrFail({ id: order.id });

      expect(found).toMatchObject({
        warehouseId: seeded.warehouseId,
        customerId,
        customerDeliveryAddressId: mainAddressId,
        customerName: null,
        state: 'unfulfilled',
      });
    });

    it('persists and reads back a Direct to Customer PurchaseDraftLineEntity with its freeze and its ending (AC-16, AC-19)', async () => {
      const seeded = await seedWarehouse('direct-line@example.test');
      const { mainAddressId } = await seedCustomer(seeded);
      const purchaseDraftId = await seedPurchaseDraft(seeded);

      const line = buildPurchaseDraftLine({
        purchaseDraftId,
        warehouseId: seeded.warehouseId,
        itemId: seeded.itemId,
        deliveryMode: 'direct_to_customer',
        customerDeliveryAddressId: mainAddressId,
        frozenDeliveryAddressText: '12 Dock Road, Riverside',
        frozenAccessNotes: 'Gate code 4417',
        frozenCustomerName: 'Acme Manufacturing',
        endingQuantity: 8,
        endingKind: 'direct_delivery',
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: now,
      });
      await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .insert(line);

      const found = await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .findOneByOrFail({ id: line.id });

      expect(found).toMatchObject({
        deliveryMode: 'direct_to_customer',
        customerDeliveryAddressId: mainAddressId,
        frozenDeliveryAddressText: '12 Dock Road, Riverside',
        frozenAccessNotes: 'Gate code 4417',
        frozenCustomerName: 'Acme Manufacturing',
        endingQuantity: 8,
        endingKind: 'direct_delivery',
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: now,
      });
    });

    it('defaults a PurchaseDraftLineEntity to Via Warehouse with no ending (AC-13)', async () => {
      const seeded = await seedWarehouse('via-warehouse-line@example.test');
      const purchaseDraftId = await seedPurchaseDraft(seeded);

      const line = buildPurchaseDraftLine({
        purchaseDraftId,
        warehouseId: seeded.warehouseId,
        itemId: seeded.itemId,
      });
      await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .insert(line);

      const found = await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .findOneByOrFail({ id: line.id });

      expect(found).toMatchObject({
        deliveryMode: 'via_warehouse',
        customerDeliveryAddressId: null,
        frozenDeliveryAddressText: null,
        endingQuantity: null,
        endingKind: null,
        endingRecordedByUserId: null,
        endingRecordedAt: null,
      });
    });

    it('persists and reads back a DemandSnapshotEntryEntity carrying the captured Delivery Address (AC-16, AC-18)', async () => {
      const seeded = await seedWarehouse('snapshot-address@example.test');
      const { customerId, mainAddressId } = await seedCustomer(seeded);
      const purchaseDraftId = await seedPurchaseDraft(seeded);

      const order = buildCustomerOrder({
        warehouseId: seeded.warehouseId,
        itemId: seeded.itemId,
        recordedByUserId: seeded.userId,
        customerId,
        customerDeliveryAddressId: mainAddressId,
        customerName: null,
      });
      await dataSource.manager.getRepository(CustomerOrderEntity).insert(order);

      const line = buildPurchaseDraftLine({
        purchaseDraftId,
        warehouseId: seeded.warehouseId,
        itemId: seeded.itemId,
      });
      await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .insert(line);

      const linkId = randomUUID();
      await dataSource.manager
        .getRepository(PurchaseDraftLineLinkEntity)
        .insert({
          id: linkId,
          purchaseDraftLineId: line.id,
          purchaseDraftId,
          warehouseId: seeded.warehouseId,
          customerOrderId: order.id,
          statedQuantity: 2,
          createdAt: now,
          updatedAt: now,
        });

      const snapshot: DemandSnapshotEntryEntity = {
        purchaseDraftLineLinkId: linkId,
        purchaseDraftLineId: line.id,
        customerOrderId: order.id,
        capturedQuantity: 3,
        capturedNeededBy: futureNeededBy,
        capturedState: 'unfulfilled',
        capturedCustomerDeliveryAddressId: mainAddressId,
        capturedDeliveryAddressText: '12 Dock Road, Riverside',
        createdAt: now,
      };
      await dataSource.manager
        .getRepository(DemandSnapshotEntryEntity)
        .insert(snapshot);

      const found = await dataSource.manager
        .getRepository(DemandSnapshotEntryEntity)
        .findOneByOrFail({ purchaseDraftLineLinkId: linkId });

      expect(found).toMatchObject({
        purchaseDraftLineId: line.id,
        customerOrderId: order.id,
        capturedCustomerDeliveryAddressId: mainAddressId,
        capturedDeliveryAddressText: '12 Dock Road, Riverside',
      });
    });
  });
};

describe('Delivery Addresses shared persistence entities', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE arrival_allocations, purchase_draft_demand_snapshots, purchase_draft_line_links, purchase_draft_lines, purchase_drafts, item_stock_adjustments, customer_orders, customer_delivery_addresses, customers, items, warehouses, sessions, users, accounts, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describeNewEntityRoundTrips();
  describeChangedEntityRoundTrips();
});
