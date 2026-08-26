import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import type { CustomerOrderState } from 'shared/domain/entities/customer-order.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
// `ConsolidatedDemandRepository` does not exist yet (T10) — this is the RED for the demand
// read data-model.md "The non-fan-out requirement" and sad.md §6.5 describe: **one** query that
// groups Unfulfilled Customer Orders by Item into total Outstanding Quantity and earliest
// needed-by date, attaches each Item's current On-hand Quantity, and attaches Coverage — the
// Purchase Drafts (neither Closed nor Discarded) linking to that demand and for what stated
// quantity — with the two independent one-to-many aggregations (Customer Orders per Item, links
// per Customer Order) combined **without fan-out** (AC-04, AC-17a, AC-20, AC-21a). The response
// shape is `openapi.yaml` `components.schemas.DemandLine` / `DemandCoverage`, the source of truth
// this RED asserts against rather than an inferred shape.
import { ConsolidatedDemandRepository } from 'shared/domain/repositories/consolidated-demand.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
// `PostgresQueryRunner.prototype.query` is the one method every TypeORM access path — raw
// `manager.query`, `repository.find`, and `QueryBuilder` alike — ultimately calls to reach
// PostgreSQL. Spying on it proves actual round trips, i.e. "one query" and not merely "one
// repository method call" — the idiom `item-catalogue.repository.integration.spec.ts` establishes.
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-26T10:00:00.000Z');

// openapi.yaml `DemandCoverage` — required: [purchaseDraftId, purchaseDraftLineId,
// purchaseDraftState, statedQuantity]. One entry per **link** (per draft line), never aggregated
// per draft: a draft with two lines both linking to the same Item yields two entries.
// `purchaseDraftState` only ever admits `draft`/`ready_for_ordering` — that enum *is* the
// AC-21a/AC-24 exclusion, so a Closed or Discarded draft's links must be absent, never present
// with a closed/discarded state.
interface DemandLineCoverage {
  readonly purchaseDraftId: string;
  readonly purchaseDraftLineId: string;
  readonly purchaseDraftState: 'draft' | 'ready_for_ordering';
  readonly statedQuantity: number;
}

// openapi.yaml `DemandLine` — required: [itemId, sku, description, unitOfMeasure,
// totalOutstandingQuantity, earliestNeededBy, onHandQuantity, unfulfilledCustomerOrderCount,
// coverage], additionalProperties: false. An Item with no Unfulfilled demand produces no Demand
// Line at all, so `totalOutstandingQuantity` is always positive.
interface DemandLineRead {
  readonly itemId: string;
  readonly sku: string;
  readonly description: string;
  readonly unitOfMeasure: string;
  readonly totalOutstandingQuantity: number;
  readonly earliestNeededBy: string;
  readonly onHandQuantity: number;
  readonly unfulfilledCustomerOrderCount: number;
  readonly coverage: readonly DemandLineCoverage[];
}

// The shape this RED step expects the implementer to expose (data-model.md "Repository
// boundaries", tasks/consolidated-demand-read.md, sad.md §6.5). Cast through this interface
// because `ConsolidatedDemandRepository` is `error`-typed while the module does not exist yet.
interface ConsolidatedDemandRepositoryContract {
  readConsolidatedDemand(warehouseId: string): Promise<DemandLineRead[]>;
}

const repository = new ConsolidatedDemandRepository(
  dataSource,
) as unknown as ConsolidatedDemandRepositoryContract;

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
// DEFERRED`), so both inserts must land inside the same transaction — the pattern every other
// integration spec under this directory uses.
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

const ITEM_DESCRIPTION = 'Cable reel, 50m';
const ITEM_UNIT_OF_MEASURE = 'each';

interface SeededItem {
  readonly id: string;
  readonly sku: string;
}

const seedItem = async (
  warehouseId: string,
  onHandQuantity = 0,
): Promise<SeededItem> => {
  const itemId = randomUUID();
  const sku = `SKU-${itemId}`;
  await dataSource.manager.getRepository(ItemEntity).insert({
    id: itemId,
    warehouseId,
    sku,
    description: ITEM_DESCRIPTION,
    unitOfMeasure: ITEM_UNIT_OF_MEASURE,
    onHandQuantity,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return { id: itemId, sku };
};

const seedCustomerOrder = async (
  warehouseId: string,
  itemId: string,
  recordedByUserId: string,
  overrides: {
    quantity?: number;
    outstandingQuantity?: number;
    neededBy?: string;
    state?: CustomerOrderState;
    cancellationReason?: string | null;
    cancelledByUserId?: string | null;
    cancelledAt?: Date | null;
  } = {},
): Promise<string> => {
  const id = randomUUID();
  const quantity = overrides.quantity ?? 10;
  await dataSource.manager.getRepository(CustomerOrderEntity).insert({
    id,
    warehouseId,
    itemId,
    customerName: 'Buyer One',
    quantity,
    outstandingQuantity: overrides.outstandingQuantity ?? quantity,
    neededBy: overrides.neededBy ?? '2026-09-30',
    state: overrides.state ?? 'unfulfilled',
    cancellationReason: overrides.cancellationReason ?? null,
    recordedByUserId,
    cancelledByUserId: overrides.cancelledByUserId ?? null,
    cancelledAt: overrides.cancelledAt ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

type PurchaseDraftState =
  'draft' | 'ready_for_ordering' | 'closed' | 'discarded';

const seedPurchaseDraft = async (
  warehouseId: string,
  createdByUserId: string,
  state: PurchaseDraftState,
): Promise<string> => {
  const id = randomUUID();
  const isClosedByReason = state === 'closed';
  // `chk_purchase_drafts_readiness_attribution` — Ready for Ordering and Closed carry the
  // readying attribution; Draft and Discarded (only ever reached from Draft) never do.
  const isReadied = state === 'ready_for_ordering' || state === 'closed';
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id,
    warehouseId,
    state,
    expectedArrivalDate: null,
    createdByUserId,
    readiedByUserId: isReadied ? createdByUserId : null,
    readiedAt: isReadied ? now : null,
    // `chk_purchase_drafts_closure_path` — a Closed draft was closed by exactly one of Arrival
    // Confirmation or a member's reasoned closure. This helper always models closure-with-reason;
    // `seedPurchaseDraftClosedByArrival` below models the Arrival Confirmation route.
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
    closedByUserId: isClosedByReason ? createdByUserId : null,
    closedAt: isClosedByReason ? now : null,
    closureReason: isClosedByReason ? 'Supplier discontinued the line' : null,
    discardedByUserId: state === 'discarded' ? createdByUserId : null,
    discardedAt: state === 'discarded' ? now : null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

// Models the other closure path — Arrival Confirmation — so AC-21a's "whichever way it closed" is
// exercised by both routes.
const seedPurchaseDraftClosedByArrival = async (
  warehouseId: string,
  createdByUserId: string,
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id,
    warehouseId,
    state: 'closed',
    expectedArrivalDate: null,
    createdByUserId,
    readiedByUserId: createdByUserId,
    readiedAt: now,
    arrivalConfirmedByUserId: createdByUserId,
    arrivalConfirmedAt: now,
    closedByUserId: createdByUserId,
    closedAt: now,
    closureReason: null,
    discardedByUserId: null,
    discardedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

const seedPurchaseDraftLine = async (
  purchaseDraftId: string,
  warehouseId: string,
  itemId: string,
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
    id,
    purchaseDraftId,
    warehouseId,
    itemId,
    orderedQuantity: 1,
    packagingTypeId: null,
    valueAddingNote: null,
    receivedQuantity: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

const seedLink = async (
  purchaseDraftLineId: string,
  purchaseDraftId: string,
  warehouseId: string,
  customerOrderId: string,
  statedQuantity: number,
): Promise<void> => {
  await dataSource.manager.getRepository(PurchaseDraftLineLinkEntity).insert({
    id: randomUUID(),
    purchaseDraftLineId,
    purchaseDraftId,
    warehouseId,
    customerOrderId,
    statedQuantity,
    createdAt: now,
    updatedAt: now,
  });
};

const findLine = (rows: readonly DemandLineRead[], itemId: string) =>
  rows.find((row) => row.itemId === itemId);

// Sort by every field so two coverage arrays compare equal regardless of row order, including two
// entries that share a draft line but differ only in `statedQuantity` (the same link's Customer
// Order is not part of this schema, so two links on one line legitimately produce two otherwise
// identical-looking entries distinguished only by quantity).
const sortCoverage = (coverage: readonly DemandLineCoverage[]) =>
  [...coverage].sort((a, b) =>
    `${a.purchaseDraftLineId}:${a.statedQuantity}`.localeCompare(
      `${b.purchaseDraftLineId}:${b.statedQuantity}`,
    ),
  );

// The suites below are extracted to named top-level functions, each registering its own
// `describe`/`it`, so the outer `describeIntegration` callback stays a short table of contents
// (max-lines-per-function) — the pattern `item-catalogue.repository.integration.spec.ts` uses.

const registerNonFanOutTests = (): void => {
  // The fan-out case `sad.md` §6.5 / data-model.md "The non-fan-out requirement" flags: **many**
  // Customer Orders behind one Item **and many links per Customer Order**, together. A naive
  // `GROUP BY` across both one-to-many joins multiplies each total by the other's row count. This
  // is a correctness test, not a performance one (tasks/consolidated-demand-read.md DoD). Because
  // Coverage is one entry **per link** (openapi.yaml `DemandCoverage` carries
  // `purchaseDraftLineId`), several links legitimately produce several coverage entries — the
  // totals staying correct alongside that is what proves there is no fan-out, not a shorter
  // coverage array.
  it('does not double count Outstanding Quantity when many Customer Orders per Item each carry many links, reports every link as its own Coverage entry, and reads it in one query', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const item = await seedItem(warehouseId, 42);

    // Three Unfulfilled Customer Orders behind the same Item.
    const orderA = await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 30,
      outstandingQuantity: 30,
      neededBy: '2026-10-15',
    });
    const orderB = await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 20,
      outstandingQuantity: 20,
      neededBy: '2026-09-01', // earliest
    });
    const orderC = await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 15,
      outstandingQuantity: 15,
      neededBy: '2026-11-20',
    });

    // Three open (non-Closed, non-Discarded) Purchase Drafts, each with one line linking to
    // several of the orders above with several links — the "many links per Customer Order" half
    // of the fan-out.
    const draft1 = await seedPurchaseDraft(warehouseId, userId, 'draft');
    const draft2 = await seedPurchaseDraft(
      warehouseId,
      userId,
      'ready_for_ordering',
    );
    const draft3 = await seedPurchaseDraft(warehouseId, userId, 'draft');

    const line1 = await seedPurchaseDraftLine(draft1, warehouseId, item.id);
    const line2 = await seedPurchaseDraftLine(draft2, warehouseId, item.id);
    const line3 = await seedPurchaseDraftLine(draft3, warehouseId, item.id);

    // orderA: linked by line1 (10) and line2 (5) — two links on one order.
    await seedLink(line1, draft1, warehouseId, orderA, 10);
    await seedLink(line2, draft2, warehouseId, orderA, 5);
    // orderB: linked by line1 (3) and line3 (7).
    await seedLink(line1, draft1, warehouseId, orderB, 3);
    await seedLink(line3, draft3, warehouseId, orderB, 7);
    // orderC: linked by line2 (4) only.
    await seedLink(line2, draft2, warehouseId, orderC, 4);

    const { result: rows, queryCount } = await withQueryCount(() =>
      repository.readConsolidatedDemand(warehouseId),
    );

    expect(queryCount).toBe(1);

    const line = findLine(rows, item.id);
    expect(line).toBeDefined();
    // The totals must equal the plain sums, not those sums multiplied by the number of links —
    // the exact defect a fan-out join produces.
    expect(line?.totalOutstandingQuantity).toBe(30 + 20 + 15);
    expect(line?.earliestNeededBy).toBe('2026-09-01');
    expect(line?.onHandQuantity).toBe(42);
    expect(line?.unfulfilledCustomerOrderCount).toBe(3);
    expect(line?.sku).toBe(item.sku);
    expect(line?.description).toBe(ITEM_DESCRIPTION);
    expect(line?.unitOfMeasure).toBe(ITEM_UNIT_OF_MEASURE);

    // Five links were seeded; Coverage carries one entry per link, unaggregated, and none of the
    // per-link `statedQuantity` figures are summed or multiplied by the other aggregation.
    expect(sortCoverage(line?.coverage ?? [])).toEqual(
      sortCoverage([
        {
          purchaseDraftId: draft1,
          purchaseDraftLineId: line1,
          purchaseDraftState: 'draft',
          statedQuantity: 10,
        },
        {
          purchaseDraftId: draft1,
          purchaseDraftLineId: line1,
          purchaseDraftState: 'draft',
          statedQuantity: 3,
        },
        {
          purchaseDraftId: draft2,
          purchaseDraftLineId: line2,
          purchaseDraftState: 'ready_for_ordering',
          statedQuantity: 5,
        },
        {
          purchaseDraftId: draft2,
          purchaseDraftLineId: line2,
          purchaseDraftState: 'ready_for_ordering',
          statedQuantity: 4,
        },
        {
          purchaseDraftId: draft3,
          purchaseDraftLineId: line3,
          purchaseDraftState: 'draft',
          statedQuantity: 7,
        },
      ]),
    );
  });
};

const registerOmissionTests = (): void => {
  // AC-04, AC-17a — Fulfilled and cancelled Customer Orders never contribute to the total, and an
  // Item behind only Fulfilled/cancelled orders has no Demand Line at all — `totalOutstandingQuantity`
  // is `minimum: 1` in the contract precisely because an empty demand is absence, not a zero row.
  // A partly-assigned order (still Unfulfilled with a reduced Outstanding Quantity, as Arrival
  // Confirmation leaves it) keeps counting for exactly the part it did not receive.
  it('omits Fulfilled and cancelled Customer Orders from every total (producing no Demand Line when nothing remains Unfulfilled), while a partly-assigned Unfulfilled order still counts for its remainder', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);

    // An Item whose only demand is now settled — Fulfilled (fully assigned) and cancelled — must
    // not appear as a Demand Line at all, not as a zero-quantity row.
    const settledItem = await seedItem(warehouseId, 5);
    await seedCustomerOrder(warehouseId, settledItem.id, userId, {
      quantity: 12,
      outstandingQuantity: 0,
      state: 'fulfilled',
    });
    await seedCustomerOrder(warehouseId, settledItem.id, userId, {
      quantity: 8,
      outstandingQuantity: 8,
      state: 'cancelled',
      cancellationReason: 'Customer changed their mind',
      cancelledByUserId: userId,
      cancelledAt: now,
    });

    // An Item with one Fulfilled order (fully assigned) and one partly-assigned Unfulfilled order
    // — the AC-17a scenario after an Arrival Confirmation.
    const partialItem = await seedItem(warehouseId, 0);
    await seedCustomerOrder(warehouseId, partialItem.id, userId, {
      quantity: 25,
      outstandingQuantity: 0,
      state: 'fulfilled',
    });
    await seedCustomerOrder(warehouseId, partialItem.id, userId, {
      quantity: 40,
      outstandingQuantity: 15, // assigned 25 of 40, 15 still owed
      state: 'unfulfilled',
      neededBy: '2026-10-01',
    });

    const rows = await repository.readConsolidatedDemand(warehouseId);

    expect(findLine(rows, settledItem.id)).toBeUndefined();

    const partialLine = findLine(rows, partialItem.id);
    expect(partialLine?.totalOutstandingQuantity).toBe(15);
    expect(partialLine?.unfulfilledCustomerOrderCount).toBe(1);
  });
};

const registerCoverageExclusionTests = (): void => {
  // AC-21a — a Closed draft (whichever route closed it) and a Discarded draft never present as
  // Coverage: openapi.yaml `DemandCoverage.purchaseDraftState` only admits `draft` and
  // `ready_for_ordering`, so a link to a Closed/Discarded draft must be **absent from the array
  // entirely**, never present carrying a closed/discarded state. The remaining demand is
  // presented as covered by no draft, while the outstanding total itself is unaffected and the
  // drafts stay readable.
  it('never presents a Closed or Discarded draft as Coverage, whichever route closed it, while the demand it once claimed still counts and the drafts stay readable', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const item = await seedItem(warehouseId, 0);

    const order = await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 50,
      outstandingQuantity: 20,
      neededBy: '2026-09-10',
    });

    // Closed by a member's reasoned closure.
    const closedByReason = await seedPurchaseDraft(
      warehouseId,
      userId,
      'closed',
    );
    const closedByReasonLine = await seedPurchaseDraftLine(
      closedByReason,
      warehouseId,
      item.id,
    );
    await seedLink(closedByReasonLine, closedByReason, warehouseId, order, 6);

    // Closed by Arrival Confirmation.
    const closedByArrival = await seedPurchaseDraftClosedByArrival(
      warehouseId,
      userId,
    );
    const closedByArrivalLine = await seedPurchaseDraftLine(
      closedByArrival,
      warehouseId,
      item.id,
    );
    await seedLink(closedByArrivalLine, closedByArrival, warehouseId, order, 4);

    // Discarded.
    const discarded = await seedPurchaseDraft(warehouseId, userId, 'discarded');
    const discardedLine = await seedPurchaseDraftLine(
      discarded,
      warehouseId,
      item.id,
    );
    await seedLink(discardedLine, discarded, warehouseId, order, 3);

    const rows = await repository.readConsolidatedDemand(warehouseId);
    const line = findLine(rows, item.id);

    expect(line?.totalOutstandingQuantity).toBe(20);
    expect(line?.unfulfilledCustomerOrderCount).toBe(1);
    expect(line?.coverage).toEqual([]);

    // The drafts themselves remain readable as the record of what was ordered.
    const persistedDrafts = await dataSource.manager
      .getRepository(PurchaseDraftEntity)
      .find({
        where: [
          { id: closedByReason },
          { id: closedByArrival },
          { id: discarded },
        ],
      });
    expect(persistedDrafts).toHaveLength(3);
  });
};

const registerMultiDraftCoverageTests = (): void => {
  // AC-20 — a Demand Line two Purchase Drafts already link to shows both, each as its own
  // Coverage entry naming its own draft line and open state, without treating that demand as
  // unavailable to a further draft (no exclusivity/locking read — `statedQuantity` is never
  // reconciled against anything else, AC-11a).
  it('shows every open draft (and its own draft line) linking to a Demand Line without treating the demand as unavailable to a further draft', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const item = await seedItem(warehouseId, 0);

    const order = await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 50,
      outstandingQuantity: 50,
      neededBy: '2026-09-10',
    });

    const draft1 = await seedPurchaseDraft(warehouseId, userId, 'draft');
    const draft1Line = await seedPurchaseDraftLine(
      draft1,
      warehouseId,
      item.id,
    );
    await seedLink(draft1Line, draft1, warehouseId, order, 20);

    const draft2 = await seedPurchaseDraft(
      warehouseId,
      userId,
      'ready_for_ordering',
    );
    const draft2Line = await seedPurchaseDraftLine(
      draft2,
      warehouseId,
      item.id,
    );
    await seedLink(draft2Line, draft2, warehouseId, order, 15);

    const rows = await repository.readConsolidatedDemand(warehouseId);
    const line = findLine(rows, item.id);

    expect(line?.totalOutstandingQuantity).toBe(50);
    expect(sortCoverage(line?.coverage ?? [])).toEqual(
      sortCoverage([
        {
          purchaseDraftId: draft1,
          purchaseDraftLineId: draft1Line,
          purchaseDraftState: 'draft',
          statedQuantity: 20,
        },
        {
          purchaseDraftId: draft2,
          purchaseDraftLineId: draft2Line,
          purchaseDraftState: 'ready_for_ordering',
          statedQuantity: 15,
        },
      ]),
    );
  });
};

const registerWarehouseScopingTests = (): void => {
  // Scoped to the acting Warehouse — an Item and its demand belonging to another Warehouse never
  // appear.
  it("is scoped to the acting Warehouse and never leaks another Warehouse's demand", async () => {
    const workspaceId = await seedWorkspace();
    const warehouseOneId = await seedWarehouse(workspaceId);
    const warehouseTwoId = await seedWarehouse(workspaceId);
    const userOneId = await seedUser(workspaceId);
    const userTwoId = await seedUser(workspaceId);

    const itemInWarehouseTwo = await seedItem(warehouseTwoId, 0);
    await seedCustomerOrder(warehouseTwoId, itemInWarehouseTwo.id, userTwoId, {
      quantity: 9,
      outstandingQuantity: 9,
    });

    const itemInWarehouseOne = await seedItem(warehouseOneId, 0);
    await seedCustomerOrder(warehouseOneId, itemInWarehouseOne.id, userOneId, {
      quantity: 3,
      outstandingQuantity: 3,
    });

    const rows = await repository.readConsolidatedDemand(warehouseOneId);

    expect(rows.map((row) => row.itemId)).toContain(itemInWarehouseOne.id);
    expect(rows.map((row) => row.itemId)).not.toContain(itemInWarehouseTwo.id);
  });
};

describeIntegration('ConsolidatedDemandRepository', () => {
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

  registerNonFanOutTests();
  registerOmissionTests();
  registerCoverageExclusionTests();
  registerMultiDraftCoverageTests();
  registerWarehouseScopingTests();
});
