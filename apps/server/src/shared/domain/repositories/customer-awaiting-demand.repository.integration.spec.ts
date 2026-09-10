import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerEntity } from 'shared/domain/entities/customer.entity';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import type { CustomerOrderState } from 'shared/domain/entities/customer-order.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
// `CustomerAwaitingDemandRepository` does not exist yet (T7) — this is the RED for `sad.md` §6.6
// step 6: "every Unfulfilled Customer Order of that Customer with its Item, Outstanding Quantity,
// needed-by date and destination, omitting Fulfilled and cancelled orders (AC-08)".
import { CustomerAwaitingDemandRepository } from 'shared/domain/repositories/customer-awaiting-demand.repository';
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

const now = new Date('2026-09-03T09:00:00.000Z');
const later = new Date('2026-09-03T12:00:00.000Z');

// The shape this RED step expects the implementer to expose. Flat and persistence-oriented: the
// nesting openapi.yaml's `CustomerOrderDestination` shows is the `customers` feature mapper's work,
// above the repository boundary (creating-a-server-repository.md § "Keep repositories isolated").
interface AwaitingCustomerOrderRead {
  readonly customerOrderId: string;
  readonly itemId: string;
  readonly itemSku: string;
  readonly itemDescription: string;
  readonly unitOfMeasure: string;
  readonly outstandingQuantity: number;
  readonly neededBy: string;
  readonly deliveryAddressId: string;
  readonly addressText: string;
  readonly accessNotes: string | null;
  readonly addressIsMain: boolean;
  readonly addressDeactivatedAt: Date | null;
}

interface CustomerAwaitingDemandRepositoryContract {
  readAwaitingCustomerOrders(
    customerId: string,
  ): Promise<AwaitingCustomerOrderRead[]>;
}

const repository = new CustomerAwaitingDemandRepository(
  dataSource,
) as unknown as CustomerAwaitingDemandRepositoryContract;

interface Seeded {
  readonly warehouseId: string;
  readonly userId: string;
  readonly customerId: string;
  readonly mainAddressId: string;
}

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

const seed = async (): Promise<Seeded> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  const warehouse = buildWarehouse({ workspaceId: workspace.id! });
  await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);
  const userId = await seedUser(workspace.id!);

  const customerId = randomUUID();
  await dataSource.manager.getRepository(CustomerEntity).insert({
    id: customerId,
    warehouseId: warehouse.id!,
    name: `Acme Ltd ${customerId}`,
    deactivatedAt: null,
    recordedByUserId: userId,
    createdAt: now,
    updatedAt: now,
  });

  const mainAddressId = randomUUID();
  await dataSource.manager.getRepository(CustomerDeliveryAddressEntity).insert({
    id: mainAddressId,
    customerId,
    warehouseId: warehouse.id!,
    addressText: '1 Depot Road, Springfield',
    accessNotes: 'Gate code on the intercom',
    isMain: true,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return { warehouseId: warehouse.id!, userId, customerId, mainAddressId };
};

const seedAddress = async (
  seeded: Seeded,
  overrides: Partial<CustomerDeliveryAddressEntity> = {},
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(CustomerDeliveryAddressEntity).insert({
    id,
    customerId: seeded.customerId,
    warehouseId: seeded.warehouseId,
    addressText: '9 Quay Street, Springfield',
    accessNotes: null,
    isMain: false,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  return id;
};

const seedItem = async (
  seeded: Seeded,
  sku: string,
  description: string,
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(ItemEntity).insert({
    id,
    warehouseId: seeded.warehouseId,
    sku,
    description,
    unitOfMeasure: 'each',
    onHandQuantity: 0,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

interface OrderOverrides {
  readonly itemId: string;
  readonly deliveryAddressId?: string;
  readonly outstandingQuantity?: number;
  readonly neededBy?: string;
  readonly state?: CustomerOrderState;
}

const seedOrder = async (
  seeded: Seeded,
  overrides: OrderOverrides,
): Promise<string> => {
  const id = randomUUID();
  const state = overrides.state ?? 'unfulfilled';
  await dataSource.manager.getRepository(CustomerOrderEntity).insert({
    id,
    warehouseId: seeded.warehouseId,
    itemId: overrides.itemId,
    customerId: seeded.customerId,
    customerDeliveryAddressId:
      overrides.deliveryAddressId ?? seeded.mainAddressId,
    // `chk_customer_orders_customer_identity` — an order naming a Customer carries no typed name.
    customerName: null,
    quantity: 100,
    outstandingQuantity: overrides.outstandingQuantity ?? 100,
    neededBy: overrides.neededBy ?? '2099-01-01',
    state,
    cancellationReason: state === 'cancelled' ? 'Seeded cancellation' : null,
    recordedByUserId: seeded.userId,
    cancelledByUserId: state === 'cancelled' ? seeded.userId : null,
    cancelledAt: state === 'cancelled' ? later : null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

describe('CustomerAwaitingDemandRepository', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE arrival_allocations, purchase_draft_demand_snapshots, purchase_draft_line_links, purchase_draft_lines, purchase_drafts, item_stock_adjustments, customer_orders, customer_delivery_addresses, customers, items, warehouse_memberships, roles, warehouses, sessions, users, accounts, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  // AC-08 — "every Unfulfilled Customer Order of that Customer with its Item, its Outstanding
  // Quantity, the date it is needed by, and the Delivery Address it is going to". One read: the
  // Item and the destination are joined in, never fetched per order (`spec.md` §6, 250 ms p95).
  it('returns each Unfulfilled order with its Item and its destination in one read', async () => {
    const seeded = await seed();
    const itemId = await seedItem(seeded, 'SKU-CABLE-50', 'Cable reel, 50m');
    const secondAddressId = await seedAddress(seeded);
    const orderId = await seedOrder(seeded, {
      itemId,
      outstandingQuantity: 40,
      neededBy: '2099-02-01',
      deliveryAddressId: secondAddressId,
    });

    const spy = vi.spyOn(PostgresQueryRunner.prototype, 'query');
    const before = spy.mock.calls.length;
    const awaiting = await repository.readAwaitingCustomerOrders(
      seeded.customerId,
    );
    const queryCount = spy.mock.calls.length - before;
    spy.mockRestore();

    expect(queryCount).toBe(1);
    expect(awaiting).toEqual([
      {
        customerOrderId: orderId,
        itemId,
        itemSku: 'SKU-CABLE-50',
        itemDescription: 'Cable reel, 50m',
        unitOfMeasure: 'each',
        outstandingQuantity: 40,
        neededBy: '2099-02-01',
        deliveryAddressId: secondAddressId,
        addressText: '9 Quay Street, Springfield',
        accessNotes: null,
        addressIsMain: false,
        addressDeactivatedAt: null,
      },
    ]);
  });

  // AC-08 — "omits its Fulfilled and cancelled Customer Orders", which is also what keeps the read
  // bounded by `idx_customer_orders_customer_unfulfilled`'s `state = 'unfulfilled'` predicate
  // rather than by everything the Customer ever ordered (data-model.md § Indexes).
  it('omits the Fulfilled and cancelled orders', async () => {
    const seeded = await seed();
    const itemId = await seedItem(seeded, 'SKU-CABLE-50', 'Cable reel, 50m');
    const unfulfilled = await seedOrder(seeded, { itemId });
    await seedOrder(seeded, {
      itemId,
      state: 'fulfilled',
      outstandingQuantity: 0,
    });
    await seedOrder(seeded, { itemId, state: 'cancelled' });

    const awaiting = await repository.readAwaitingCustomerOrders(
      seeded.customerId,
    );

    expect(awaiting.map((order) => order.customerOrderId)).toEqual([
      unfulfilled,
    ]);
  });

  // openapi.yaml `CustomerDetail.awaitingCustomerOrders` — "earliest needed-by first", which
  // `idx_customer_orders_customer_unfulfilled` already returns without a sort step.
  it('orders the awaiting list by needed-by date', async () => {
    const seeded = await seed();
    const itemId = await seedItem(seeded, 'SKU-CABLE-50', 'Cable reel, 50m');
    const latest = await seedOrder(seeded, { itemId, neededBy: '2099-03-01' });
    const earliest = await seedOrder(seeded, {
      itemId,
      neededBy: '2099-01-01',
    });
    const middle = await seedOrder(seeded, { itemId, neededBy: '2099-02-01' });

    const awaiting = await repository.readAwaitingCustomerOrders(
      seeded.customerId,
    );

    expect(awaiting.map((order) => order.customerOrderId)).toEqual([
      earliest,
      middle,
      latest,
    ]);
  });

  // openapi.yaml `CustomerOrderDestination` — `isMain` and `deactivatedAt` report *why* it is this
  // address: the Customer's current Main one, one the member stated instead, or one that has since
  // been made Inactive while the order keeps naming it and keeps counting exactly as before
  // (AC-06a). Both are read live, not as they were when the order was recorded.
  it('reports the destination as it stands now, Inactive addresses included', async () => {
    const seeded = await seed();
    const itemId = await seedItem(seeded, 'SKU-CABLE-50', 'Cable reel, 50m');
    const retiredAddressId = await seedAddress(seeded, {
      addressText: '4 Old Wharf, Springfield',
      accessNotes: 'Ring the bell',
      deactivatedAt: later,
    });
    await seedOrder(seeded, {
      itemId,
      deliveryAddressId: retiredAddressId,
      neededBy: '2099-01-01',
    });
    await seedOrder(seeded, { itemId, neededBy: '2099-02-01' });

    const awaiting = await repository.readAwaitingCustomerOrders(
      seeded.customerId,
    );

    expect(awaiting[0]).toMatchObject({
      deliveryAddressId: retiredAddressId,
      addressText: '4 Old Wharf, Springfield',
      accessNotes: 'Ring the bell',
      addressIsMain: false,
      addressDeactivatedAt: later,
    });
    expect(awaiting[1]).toMatchObject({
      deliveryAddressId: seeded.mainAddressId,
      addressIsMain: true,
      addressDeactivatedAt: null,
    });
  });

  // The read is bounded by one Customer, so another Customer's Unfulfilled orders never reach it —
  // and a Customer awaiting nothing answers with an empty list rather than with a missing one.
  it('is bounded by the one Customer asked for', async () => {
    const seeded = await seed();
    const other = await seed();
    const itemId = await seedItem(seeded, 'SKU-CABLE-50', 'Cable reel, 50m');
    await seedOrder(seeded, { itemId });

    expect(
      await repository.readAwaitingCustomerOrders(other.customerId),
    ).toEqual([]);
  });
});
