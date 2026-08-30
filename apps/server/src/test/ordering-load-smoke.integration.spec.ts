import { randomUUID } from 'node:crypto';

import { PermissionId } from '@warehouser/shared-types/enums';
import { RecordCustomerOrderCommand } from 'customer-orders/usecases/commands/record-customer-order.command';
import { ReadConsolidatedDemandQuery } from 'customer-orders/usecases/queries/read-consolidated-demand.query';
import { AdjustItemOnHandCommand } from 'items/usecases/commands/adjust-item-on-hand.command';
import { ListItemCatalogueQuery } from 'items/usecases/queries/list-item-catalogue.query';
import { chunk } from 'lodash';
import { PurchaseDraftAssemblyService } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import { ClosePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/close-purchase-draft.command';
import { CreatePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/create-purchase-draft.command';
import { ReadPurchaseDraftQuery } from 'purchase-drafts/usecases/queries/read-purchase-draft.query';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';
import { ConsolidatedDemandRepository } from 'shared/domain/repositories/consolidated-demand.repository';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import { ItemStockAdjustmentRepository } from 'shared/domain/repositories/item-stock-adjustment.repository';
import { PackagingTypeCatalogueRepository } from 'shared/domain/repositories/packaging-type-catalogue.repository';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';
import { PurchaseDraftFreezeRepository } from 'shared/domain/repositories/purchase-draft-freeze.repository';
import { PurchaseDraftReadRepository } from 'shared/domain/repositories/purchase-draft-read.repository';
// `withOperationTiming` is the one helper `sad.md` §8 "Performance and diagnostics" names as the
// source of every stage's structured timing field (spec.md §6, ADR "structured logging instead of
// telemetry" — docs/system/adr/03-08-2026-structured-logging-instead-of-telemetry.md). This smoke
// test adds no metrics client, exporter or collector; it only wraps existing repository/use-case
// calls with the existing helper and reads back the `durationMs` field it already emits.
import { withOperationTiming } from 'shared/logger/with-operation-timing';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

// spec.md §1 scale — "roughly 2 000 Items, 5 000 Unfulfilled Customer Orders, and 250 open
// Purchase Drafts per Warehouse" — plus accumulated Closed drafts the DoD adds on top (the
// consolidated demand read's coverage subquery excludes Closed/Discarded drafts, but the table
// still carries their rows, so they must be present for the read to be measured at real volume
// rather than an empty one).
const ITEM_COUNT = 2_000;
const UNFULFILLED_CUSTOMER_ORDER_COUNT = 5_000;
const OPEN_PURCHASE_DRAFT_COUNT = 250;
const ACCUMULATED_CLOSED_PURCHASE_DRAFT_COUNT = 500;
const INSERT_CHUNK_SIZE = 500;

// spec.md §6.
const STAGE_LATENCY_LIMITS_MS = {
  authorization: 50,
  demandRead: 400,
  itemAndDraftRead: 250,
  mutation: 500,
} as const;

// Opt-in for local runs (`RUN_INTEGRATION=1`), overridable for a fast developer iteration loop;
// the release gate invokes it at the full 600s spec.md §6 requirement, following the
// `workspaces-load-smoke.integration.spec.ts` / `users-management` load-smoke precedent (an
// opt-in, human/CI-invoked run rather than a test that always executes in the default `pnpm test`
// pass).
const DURATION_SECONDS = Number(
  process.env.ORDERING_LOAD_DURATION_SECONDS ?? 600,
);
const REQUIRED_THROUGHPUT_PER_SECOND = 50;

type DurationSample = readonly number[];

const percentile95 = (values: DurationSample, label: string): number => {
  if (values.length === 0) {
    throw new Error(`${label} requires at least one duration sample`);
  }
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1];
};

const recordingLogger = (
  bucket: number[],
): { info: (entry: Readonly<Record<string, unknown>>) => void } => ({
  info: (entry) => bucket.push(entry.durationMs as number),
});

const scopedActor = (userId: string, warehouseId: string) => ({
  userId,
  warehouseId,
});

const calendarDaysFromNow = (days: number): string =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

interface OrderingScaleFixture {
  readonly workspaceId: string;
  readonly warehouseId: string;
  readonly ownerUserId: string;
  readonly roleId: string;
  readonly itemIds: readonly string[];
  readonly openDraftIds: readonly string[];
  readonly unfulfilledOrderIds: readonly string[];
}

const ALL_ORDERING_PERMISSIONS: readonly string[] = [
  PermissionId.ITEMS_WATCH,
  PermissionId.ITEMS_CREATE,
  PermissionId.ITEMS_UPDATE,
  PermissionId.ITEMS_DEACTIVATE,
  PermissionId.ITEM_STOCK_ADJUST,
  PermissionId.CUSTOMER_ORDERS_WATCH,
  PermissionId.CUSTOMER_ORDERS_CREATE,
  PermissionId.CUSTOMER_ORDERS_UPDATE,
  PermissionId.CUSTOMER_ORDERS_CANCEL,
  PermissionId.PURCHASE_DRAFTS_WATCH,
  PermissionId.PURCHASE_DRAFTS_CREATE,
  PermissionId.PURCHASE_DRAFTS_UPDATE,
  PermissionId.PURCHASE_DRAFTS_READY,
  PermissionId.PURCHASE_DRAFTS_RECEIVE,
  PermissionId.PURCHASE_DRAFTS_CLOSE,
  PermissionId.PURCHASE_DRAFTS_DISCARD,
];

// Seeds one Workspace, one Warehouse, one Role granted every ordering Permission (so every
// measured operation below is authorized, and the authorization stage itself is the thing being
// timed rather than an unrelated denial), and one identity acting in it.
const seedWarehouseAndActor = async (): Promise<
  Pick<
    OrderingScaleFixture,
    'workspaceId' | 'warehouseId' | 'ownerUserId' | 'roleId'
  >
> => {
  const now = new Date();
  const workspaceId = randomUUID();
  const warehouseId = randomUUID();
  const roleId = randomUUID();
  const ownerUserId = randomUUID();

  await dataSource.manager.getRepository(WorkspaceEntity).insert({
    id: workspaceId,
    name: 'Ordering Load Smoke Workspace',
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(WarehouseEntity).insert({
    id: warehouseId,
    workspaceId,
    name: 'Ordering Load Smoke Warehouse',
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(RoleEntity).insert({
    id: roleId,
    warehouseId,
    name: 'Ordering Load Smoke Role',
    kind: 'custom',
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(PermissionEntity).upsert(
    ALL_ORDERING_PERMISSIONS.map((id) => ({
      id,
      label: id,
      kind: 'assignable' as const,
      createdAt: now,
      updatedAt: now,
    })),
    ['id'],
  );
  await dataSource.manager.getRepository(RolePermissionEntity).insert(
    ALL_ORDERING_PERMISSIONS.map((permissionId) => ({
      roleId,
      permissionId,
      roleKind: 'custom' as const,
      permissionKind: 'assignable' as const,
    })),
  );
  // `accounts.user_id` / `users.account_id` form a deferred circular FK pair, so both inserts
  // must land inside the same transaction (see `test/factories/entity-factories.ts`
  // `persistIdentity` and every HTTP-contract integration spec's `seedIdentity`).
  await dataSource.transaction(async (manager) => {
    await manager.getRepository(AccountEntity).insert({
      id: ownerUserId,
      userId: ownerUserId,
      normalizedEmail: `ordering.load-smoke.${ownerUserId}@example.test`,
      passwordHash: 'synthetic-hash',
      passwordHashAlgorithm: 'scrypt',
      passwordHashParameters: { cost: 1_024 },
      createdAt: now,
      updatedAt: now,
    });
    await manager.getRepository(UserEntity).insert({
      id: ownerUserId,
      accountId: ownerUserId,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    });
  });
  await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
    userId: ownerUserId,
    warehouseId,
    workspaceId,
    roleId,
    roleKind: 'custom',
    createdAt: now,
    updatedAt: now,
  });

  return { workspaceId, warehouseId, roleId, ownerUserId };
};

const seedItems = async (
  warehouseId: string,
  count: number,
): Promise<string[]> => {
  const now = new Date();
  const itemIds = Array.from({ length: count }, () => randomUUID());
  const rows = itemIds.map((id, index) => ({
    id,
    warehouseId,
    sku: `LOAD-SMOKE-${index.toString().padStart(6, '0')}`,
    description: 'Ordering load smoke Item',
    unitOfMeasure: 'pieces',
    onHandQuantity: 0,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  }));
  for (const batch of chunk(rows, INSERT_CHUNK_SIZE)) {
    await dataSource.manager.getRepository(ItemEntity).insert(batch);
  }
  return itemIds;
};

// spec.md §6 "the fan-out case" — several Unfulfilled Customer Orders per Item, exactly the shape
// the consolidated demand read's non-fan-out aggregation must resolve at scale.
const seedUnfulfilledCustomerOrders = async (
  warehouseId: string,
  ownerUserId: string,
  itemIds: readonly string[],
  count: number,
): Promise<string[]> => {
  const now = new Date();
  const orderIds = Array.from({ length: count }, () => randomUUID());
  const rows = orderIds.map((id, index) => ({
    id,
    warehouseId,
    itemId: itemIds[index % itemIds.length],
    customerName: `Load Smoke Customer ${index}`,
    quantity: 10,
    outstandingQuantity: 10,
    neededBy: calendarDaysFromNow(30),
    state: 'unfulfilled' as const,
    cancellationReason: null,
    recordedByUserId: ownerUserId,
    cancelledByUserId: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  }));
  for (const batch of chunk(rows, INSERT_CHUNK_SIZE)) {
    await dataSource.manager.getRepository(CustomerOrderEntity).insert(batch);
  }
  return orderIds;
};

// Builds `count` Purchase Drafts in the given state, each with one line linked to one Customer
// Order, so the consolidated demand read's Coverage subquery (open drafts) and the read/close
// paths this suite measures both see realistic volume. `state: 'closed'` seeds the accumulated
// Closed drafts the DoD requires alongside the `spec.md` §1 open-draft count.
const seedPurchaseDrafts = async (
  warehouseId: string,
  ownerUserId: string,
  itemIds: readonly string[],
  orderIds: readonly string[],
  count: number,
  state: 'draft' | 'closed',
): Promise<string[]> => {
  const now = new Date();
  const draftIds = Array.from({ length: count }, () => randomUUID());
  const draftRows = draftIds.map((id) => ({
    id,
    warehouseId,
    state,
    expectedArrivalDate: null,
    createdByUserId: ownerUserId,
    readiedByUserId: state === 'closed' ? ownerUserId : null,
    readiedAt: state === 'closed' ? now : null,
    closedByUserId: state === 'closed' ? ownerUserId : null,
    closedAt: state === 'closed' ? now : null,
    closureReason: state === 'closed' ? 'Load smoke accumulated closure' : null,
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
    discardedByUserId: null,
    discardedAt: null,
    createdAt: now,
    updatedAt: now,
  }));
  for (const batch of chunk(draftRows, INSERT_CHUNK_SIZE)) {
    await dataSource.manager.getRepository(PurchaseDraftEntity).insert(batch);
  }

  const lineIds = draftIds.map(() => randomUUID());
  const lineRows = draftIds.map((purchaseDraftId, index) => ({
    id: lineIds[index],
    purchaseDraftId,
    warehouseId,
    itemId: itemIds[index % itemIds.length],
    orderedQuantity: 10,
    packagingTypeId: null,
    valueAddingNote: null,
    receivedQuantity: null,
    createdAt: now,
    updatedAt: now,
  }));
  for (const batch of chunk(lineRows, INSERT_CHUNK_SIZE)) {
    await dataSource.manager
      .getRepository(PurchaseDraftLineEntity)
      .insert(batch);
  }

  const linkRows = draftIds.map((purchaseDraftId, index) => ({
    id: randomUUID(),
    purchaseDraftLineId: lineIds[index],
    purchaseDraftId,
    warehouseId,
    customerOrderId: orderIds[index % orderIds.length],
    statedQuantity: 5,
    createdAt: now,
    updatedAt: now,
  }));
  for (const batch of chunk(linkRows, INSERT_CHUNK_SIZE)) {
    await dataSource.manager
      .getRepository(PurchaseDraftLineLinkEntity)
      .insert(batch);
  }

  return draftIds;
};

const seedOrderingScale = async (): Promise<OrderingScaleFixture> => {
  const { workspaceId, warehouseId, roleId, ownerUserId } =
    await seedWarehouseAndActor();
  const itemIds = await seedItems(warehouseId, ITEM_COUNT);
  const unfulfilledOrderIds = await seedUnfulfilledCustomerOrders(
    warehouseId,
    ownerUserId,
    itemIds,
    UNFULFILLED_CUSTOMER_ORDER_COUNT,
  );
  const openDraftIds = await seedPurchaseDrafts(
    warehouseId,
    ownerUserId,
    itemIds,
    unfulfilledOrderIds,
    OPEN_PURCHASE_DRAFT_COUNT,
    'draft',
  );
  await seedPurchaseDrafts(
    warehouseId,
    ownerUserId,
    itemIds,
    unfulfilledOrderIds,
    ACCUMULATED_CLOSED_PURCHASE_DRAFT_COUNT,
    'closed',
  );

  return {
    workspaceId,
    warehouseId,
    ownerUserId,
    roleId,
    itemIds,
    openDraftIds,
    unfulfilledOrderIds,
  };
};

interface ThroughputSmokeDeps {
  readonly accessCurrentUsers: AccessCurrentUserRepository;
  readonly readConsolidatedDemand: ReadConsolidatedDemandQuery;
  readonly listItemCatalogue: ListItemCatalogueQuery;
  readonly readPurchaseDraft: ReadPurchaseDraftQuery;
  readonly recordCustomerOrder: RecordCustomerOrderCommand;
  readonly adjustItemOnHand: AdjustItemOnHandCommand;
  readonly createPurchaseDraft: CreatePurchaseDraftCommand;
  readonly closePurchaseDraft: ClosePurchaseDraftCommand;
  // Every command sampled below is `@Transactional()`, and each takes a pessimistic lock or a
  // guarded conditional update. Calling `execute` on the instance directly runs the method, not
  // the Nest interceptor pipeline that opens the transaction the decorator declares, so the
  // mutations have to be driven through this service instead — mirroring
  // `workspaces-load-smoke.integration.spec.ts`.
  readonly transactions: DbTransactionService;
}

const accessCurrentUserFor = (
  fixture: OrderingScaleFixture,
  permissionId: PermissionId,
): AccessCurrentUser => ({
  userId: fixture.ownerUserId,
  warehouseId: fixture.warehouseId,
  roleId: fixture.roleId,
  roleKind: 'custom',
  permissionId,
  archived: false,
});

// A fresh Ready for Ordering Purchase Draft, seeded directly (not through the freeze flow, which
// is out of this suite's scope) purely so each iteration's Close mutation has a real frozen draft
// to close. The insert itself is unmeasured fixture setup; only the Close call below is timed.
const seedClosableDraft = async (
  fixture: OrderingScaleFixture,
): Promise<string> => {
  const now = new Date();
  const draftId = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id: draftId,
    warehouseId: fixture.warehouseId,
    state: 'ready_for_ordering',
    expectedArrivalDate: null,
    createdByUserId: fixture.ownerUserId,
    readiedByUserId: fixture.ownerUserId,
    readiedAt: now,
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
    purchaseDraftId: draftId,
    warehouseId: fixture.warehouseId,
    itemId: fixture.itemIds[0],
    orderedQuantity: 5,
    packagingTypeId: null,
    valueAddingNote: null,
    receivedQuantity: null,
    createdAt: now,
    updatedAt: now,
  });
  return draftId;
};

// Extracted from the `it` block below purely to keep the describe callback under the
// `max-lines-per-function` limit; every assertion and the overall behaviour are unchanged from an
// inline version.

const runThroughputSmokeTest = async (
  fixture: OrderingScaleFixture,
  deps: ThroughputSmokeDeps,
): Promise<void> => {
  const {
    accessCurrentUsers,
    adjustItemOnHand,
    closePurchaseDraft,
    createPurchaseDraft,
    listItemCatalogue,
    readConsolidatedDemand,
    readPurchaseDraft,
    recordCustomerOrder,
    transactions,
  } = deps;

  const samples: Record<keyof typeof STAGE_LATENCY_LIMITS_MS, number[]> = {
    authorization: [],
    demandRead: [],
    itemAndDraftRead: [],
    mutation: [],
  };

  const actor = scopedActor(fixture.ownerUserId, fixture.warehouseId);
  let totalOperations = 0;
  const startedAt = Date.now();
  let iteration = 0;

  while ((Date.now() - startedAt) / 1000 < DURATION_SECONDS) {
    const itemId = fixture.itemIds[iteration % fixture.itemIds.length];
    const draftId =
      fixture.openDraftIds[iteration % fixture.openDraftIds.length];
    const closableDraftId = await seedClosableDraft(fixture);
    iteration += 1;

    await Promise.all([
      withOperationTiming(
        recordingLogger(samples.authorization),
        'ordering.authorize_warehouse',
        actor,
        () =>
          accessCurrentUsers.resolveRequiredPermission(
            fixture.ownerUserId,
            fixture.warehouseId,
            PermissionId.CUSTOMER_ORDERS_WATCH,
          ),
      ),
      withOperationTiming(
        recordingLogger(samples.demandRead),
        'ordering.read_consolidated_demand',
        actor,
        () =>
          readConsolidatedDemand.execute(
            accessCurrentUserFor(fixture, PermissionId.CUSTOMER_ORDERS_WATCH),
          ),
      ),
      withOperationTiming(
        recordingLogger(samples.itemAndDraftRead),
        'ordering.list_item_catalogue',
        actor,
        () =>
          listItemCatalogue.execute(
            accessCurrentUserFor(fixture, PermissionId.ITEMS_WATCH),
          ),
      ),
      withOperationTiming(
        recordingLogger(samples.itemAndDraftRead),
        'ordering.read_purchase_draft',
        actor,
        () =>
          readPurchaseDraft.execute(
            accessCurrentUserFor(fixture, PermissionId.PURCHASE_DRAFTS_WATCH),
            draftId,
          ),
      ),
      withOperationTiming(
        recordingLogger(samples.mutation),
        'ordering.record_customer_order',
        actor,
        () =>
          transactions.executeInTransaction({}, () =>
            recordCustomerOrder.execute(
              accessCurrentUserFor(
                fixture,
                PermissionId.CUSTOMER_ORDERS_CREATE,
              ),
              {
                itemId,
                customerName: `Load Smoke Mutation Customer ${randomUUID()}`,
                quantity: 1,
                neededBy: calendarDaysFromNow(14),
              },
            ),
          ),
      ),
      withOperationTiming(
        recordingLogger(samples.mutation),
        'ordering.adjust_item_on_hand',
        actor,
        () =>
          transactions.executeInTransaction({}, () =>
            adjustItemOnHand.execute(
              accessCurrentUserFor(fixture, PermissionId.ITEM_STOCK_ADJUST),
              itemId,
              { countedQuantity: 1, reason: 'Load smoke recount' },
            ),
          ),
      ),
      withOperationTiming(
        recordingLogger(samples.mutation),
        'ordering.create_purchase_draft',
        actor,
        () =>
          transactions.executeInTransaction({}, () =>
            createPurchaseDraft.execute(
              accessCurrentUserFor(
                fixture,
                PermissionId.PURCHASE_DRAFTS_CREATE,
              ),
              { lines: [{ itemId, orderedQuantity: 1 }] },
            ),
          ),
      ),
      withOperationTiming(
        recordingLogger(samples.mutation),
        'ordering.close_purchase_draft',
        actor,
        () =>
          transactions.executeInTransaction({}, () =>
            closePurchaseDraft.execute(
              accessCurrentUserFor(fixture, PermissionId.PURCHASE_DRAFTS_CLOSE),
              closableDraftId,
              { closureReason: 'Load smoke closure' },
            ),
          ),
      ),
    ]);
    totalOperations += 8;
  }

  const durationSeconds = (Date.now() - startedAt) / 1000;
  const throughputPerSecond = totalOperations / durationSeconds;

  expect(durationSeconds).toBeGreaterThanOrEqual(DURATION_SECONDS);
  expect(throughputPerSecond).toBeGreaterThanOrEqual(
    REQUIRED_THROUGHPUT_PER_SECOND,
  );

  for (const [stage, limitMs] of Object.entries(STAGE_LATENCY_LIMITS_MS) as [
    keyof typeof STAGE_LATENCY_LIMITS_MS,
    number,
  ][]) {
    const p95Ms = percentile95(samples[stage], `${stage} p95`);
    expect(p95Ms).toBeLessThanOrEqual(limitMs);
  }
};

describeIntegration('Ordering load smoke (spec.md §6)', () => {
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);

  const accessCurrentUsers = new AccessCurrentUserRepository(dataSource);
  const consolidatedDemandRepository = new ConsolidatedDemandRepository(
    dataSource,
  );
  const itemCatalogueRepository = new ItemCatalogueRepository(dataSource);
  const itemStockAdjustmentRepository = new ItemStockAdjustmentRepository(
    dataSource,
  );
  const customerOrderLifecycleRepository = new CustomerOrderLifecycleRepository(
    dataSource,
  );
  const purchaseDraftReadRepository = new PurchaseDraftReadRepository(
    dataSource,
  );
  const purchaseDraftAssemblyRepository = new PurchaseDraftAssemblyRepository(
    dataSource,
  );
  const purchaseDraftFreezeRepository = new PurchaseDraftFreezeRepository(
    dataSource,
  );
  const packagingTypeCatalogueRepository = new PackagingTypeCatalogueRepository(
    dataSource,
  );

  const readConsolidatedDemand = new ReadConsolidatedDemandQuery(
    consolidatedDemandRepository,
  );
  const listItemCatalogue = new ListItemCatalogueQuery(itemCatalogueRepository);
  const readPurchaseDraft = new ReadPurchaseDraftQuery(
    purchaseDraftReadRepository,
  );
  const recordCustomerOrder = new RecordCustomerOrderCommand(
    customerOrderLifecycleRepository,
    itemCatalogueRepository,
  );
  const adjustItemOnHand = new AdjustItemOnHandCommand(
    itemCatalogueRepository,
    itemStockAdjustmentRepository,
  );
  const createPurchaseDraft = new CreatePurchaseDraftCommand(
    purchaseDraftAssemblyRepository,
    new PurchaseDraftAssemblyService(
      itemCatalogueRepository,
      customerOrderLifecycleRepository,
      packagingTypeCatalogueRepository,
    ),
  );
  const closePurchaseDraft = new ClosePurchaseDraftCommand(
    purchaseDraftFreezeRepository,
  );

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.query(
      'TRUNCATE arrival_allocations, purchase_draft_demand_snapshots, purchase_draft_line_links, purchase_draft_lines, purchase_drafts, item_stock_adjustments, customer_orders, items, warehouse_memberships, role_permissions, roles, warehouses, workspaces, sessions, users, accounts, permissions CASCADE',
    );
    await dataSource.destroy();
  });

  it(
    'sustains at least 50 ordering operations per second per instance for ' +
      'ten minutes and reports p95 against spec.md §6 for authorization, the ' +
      'consolidated demand read at scale, Item/draft reads and every mutation, ' +
      'with structured timing fields present on each',
    async () => {
      const fixture = await seedOrderingScale();

      await runThroughputSmokeTest(fixture, {
        accessCurrentUsers,
        readConsolidatedDemand,
        listItemCatalogue,
        readPurchaseDraft,
        recordCustomerOrder,
        adjustItemOnHand,
        createPurchaseDraft,
        closePurchaseDraft,
        transactions,
      });
    },
    (DURATION_SECONDS + 120) * 1000,
  );
});
