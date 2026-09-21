import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerEntity } from 'shared/domain/entities/customer.entity';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import type { CustomerOrderState } from 'shared/domain/entities/customer-order.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import type { PurchaseDraftLineDeliveryMode } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
// `WarehouseDemandCoverageRepository` does not exist yet (T5) — this is the RED for the Coverage
// Gap read data-model.md "The read model" / sad.md §6.3 describe: **one** statement, four CTEs
// joined on `item_id` — `outstanding` over Unfulfilled Customer Orders, `inbound` over open
// Purchase Draft Lines, `on_hand` read directly from the Item, and a fourth CTE rolling every Item
// below the tenth into a Remainder Row — with the first three aggregated independently so no
// quantity is multiplied by the number of records counted beside it (AC-03, AC-04, AC-05, AC-06,
// AC-06a, AC-08, AC-11, AC-25). The response shape is `openapi.yaml`
// `components.schemas.CoverageGapPanel` / `CoverageGapRow` / `CoverageGapRemainder`, the source of
// truth this RED asserts against rather than an inferred shape.
//
// Scope note, stated rather than left implicit: `data-model.md § Time, timezone and the week`
// binds `APP_TIMEZONE` into exactly three expressions — Order Flow's week (AC-16), the On-time
// Arrival Rate's verdict (AC-20b), and `now()`-derived bands/horizons — and none of them is a
// column of `CoverageGapPanel`/`CoverageGapRow`/`CoverageGapRemainder` (`ArrivalTimingPanel` is the
// sibling schema that carries a `timezone` field; `CoverageGapPanel` carries none).
// `sad.md §6.3`'s Coverage Gap statement reads `outstanding`, `inbound` and `on_hand` with no
// date/time predicate anywhere. The timezone-bound-parameter join therefore belongs to whichever
// method first computes "today" or a week boundary — Arrival Timing (T6, `needed_by` bucketing
// against the week in progress) or the Workspace performance reads — not to this method. This spec
// does not assert an APP_TIMEZONE join for that reason; see the handover for the full note.
import { WarehouseDemandCoverageRepository } from 'shared/domain/repositories/warehouse-demand-coverage.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
// Counts actual PostgreSQL round trips, i.e. "one statement" and not merely "one repository method
// call" — the idiom `consolidated-demand.repository.integration.spec.ts` establishes.
import { withQueryCount } from 'test/pglite/query-recorder';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const now = new Date('2026-09-21T10:00:00.000Z');

// openapi.yaml `CoverageGapRow` — required: [itemId, sku, totalOutstandingQuantity,
// onHandQuantity, inboundQuantity, uncoveredQuantity], additionalProperties: false.
interface CoverageGapRowRead {
  readonly itemId: string;
  readonly sku: string;
  readonly totalOutstandingQuantity: number;
  readonly onHandQuantity: number;
  readonly inboundQuantity: number;
  readonly uncoveredQuantity: number;
}

// openapi.yaml `CoverageGapRemainder` — required: [itemCount, totalOutstandingQuantity,
// onHandQuantity, inboundQuantity, uncoveredQuantity]. The four quantities are the per-Item
// figures summed across the Items the row holds, each computed on the same terms as
// `CoverageGapRow` (so `uncoveredQuantity` is the sum of each Item's own floored value, never a
// raw difference re-floored once).
interface CoverageGapRemainderRead {
  readonly itemCount: number;
  readonly totalOutstandingQuantity: number;
  readonly onHandQuantity: number;
  readonly inboundQuantity: number;
  readonly uncoveredQuantity: number;
}

// openapi.yaml `CoverageGapPanel` — required: [rows, remainder]. `rows` is bounded to ten;
// `remainder` is `null` only while ten or fewer Items qualify.
interface CoverageGapRead {
  readonly rows: readonly CoverageGapRowRead[];
  readonly remainder: CoverageGapRemainderRead | null;
}

// openapi.yaml `ArrivalTimingBucket` — required: [kind, weekStart, owedQuantity,
// expectedQuantity], additionalProperties: false. `weekStart` is `null` only on the `overdue`
// bucket (`ArrivalTimingBucketKind`).
interface ArrivalTimingBucketRead {
  readonly kind: 'overdue' | 'week';
  readonly weekStart: string | null;
  readonly owedQuantity: number;
  readonly expectedQuantity: number;
}

// openapi.yaml `ArrivalTimingExclusions.beyondHorizon` — required: [owedQuantity,
// customerOrderCount].
interface ArrivalTimingBeyondHorizonRead {
  readonly owedQuantity: number;
  readonly customerOrderCount: number;
}

// openapi.yaml `ArrivalTimingExclusions.undatedReadyDrafts` /
// `.datedDraftsStillInDraft` — both required: [draftCount, orderedQuantity].
interface ArrivalTimingDraftExclusionRead {
  readonly draftCount: number;
  readonly orderedQuantity: number;
}

// openapi.yaml `ArrivalTimingExclusions.draftsSinceClosedOrDiscarded` — required: [draftCount]
// only; no criterion asks for its quantity (see `api-sync-report.md` § Finding 3).
interface ArrivalTimingClosedOrDiscardedExclusionRead {
  readonly draftCount: number;
}

// openapi.yaml `ArrivalTimingExclusions` — required: [beyondHorizon, undatedReadyDrafts,
// datedDraftsStillInDraft, draftsSinceClosedOrDiscarded], additionalProperties: false.
interface ArrivalTimingExclusionsRead {
  readonly beyondHorizon: ArrivalTimingBeyondHorizonRead;
  readonly undatedReadyDrafts: ArrivalTimingDraftExclusionRead;
  readonly datedDraftsStillInDraft: ArrivalTimingDraftExclusionRead;
  readonly draftsSinceClosedOrDiscarded: ArrivalTimingClosedOrDiscardedExclusionRead;
}

// openapi.yaml `ArrivalTimingPanel` — the repository's own shape carries `buckets` and
// `exclusions` only; `timezone` is composed by the query from the same bound parameter it passed
// in, not read back from the repository (sad.md §6.4: "R-->>PQ: the two series and the four
// exclusions").
interface ArrivalTimingRead {
  readonly buckets: readonly ArrivalTimingBucketRead[];
  readonly exclusions: ArrivalTimingExclusionsRead;
}

// The shape this RED step expects the implementer to expose (data-model.md "The read model",
// tasks/coverage-gap-repository.md, tasks/arrival-timing-repository.md, sad.md §6.3/§6.4). Cast
// through this interface because `WarehouseDemandCoverageRepository` is `error`-typed while
// `readArrivalTiming` does not exist yet. `timezone` is a **method parameter**, not a constructor
// `@Inject(APP_TIMEZONE)` — data-model.md § "Time, timezone and the week" requires it be a bound
// query parameter rather than the connection's implicit `TimeZone`, and a method parameter is what
// lets one repository instance be driven with two different zones in the same test
// (`warehouse-purchasing-read.repository.ts`'s `readPurchasingPipeline(warehouseId, timezone)`
// establishes the same shape for the sibling Age Band read).
interface WarehouseDemandCoverageRepositoryContract {
  readCoverageGap(warehouseId: string): Promise<CoverageGapRead>;
  readArrivalTiming(
    warehouseId: string,
    timezone: string,
  ): Promise<ArrivalTimingRead>;
}

const repository = new WarehouseDemandCoverageRepository(
  dataSource,
) as unknown as WarehouseDemandCoverageRepositoryContract;

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

interface SeededItem {
  readonly id: string;
  readonly sku: string;
}

const seedItem = async (
  warehouseId: string,
  overrides: {
    onHandQuantity?: number;
    sku?: string;
    deactivatedAt?: Date | null;
  } = {},
): Promise<SeededItem> => {
  const itemId = randomUUID();
  const sku = overrides.sku ?? `SKU-${itemId}`;
  await dataSource.manager.getRepository(ItemEntity).insert({
    id: itemId,
    warehouseId,
    sku,
    description: 'Cable reel, 50m',
    unitOfMeasure: 'each',
    onHandQuantity: overrides.onHandQuantity ?? 0,
    deactivatedAt: overrides.deactivatedAt ?? null,
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
    state?: CustomerOrderState;
    cancellationReason?: string | null;
    cancelledByUserId?: string | null;
    cancelledAt?: Date | null;
    neededBy?: string;
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
  expectedArrivalDate: string | null = null,
): Promise<string> => {
  const id = randomUUID();
  const isClosedByReason = state === 'closed';
  // `chk_purchase_drafts_readiness_attribution` — Ready for Ordering and Closed carry the
  // readying attribution; Draft and Discarded never do.
  const isReadied = state === 'ready_for_ordering' || state === 'closed';
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id,
    warehouseId,
    state,
    expectedArrivalDate,
    createdByUserId,
    readiedByUserId: isReadied ? createdByUserId : null,
    readiedAt: isReadied ? now : null,
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

// A Direct to Customer line must name a Customer Delivery Address
// (`chk_purchase_draft_lines_delivery_mode_address`); a Via Warehouse line must name none. Seeds
// its own Customer and Address so `registerBothDeliveryModesTest` can stay a single call.
const seedCustomerDeliveryAddress = async (
  warehouseId: string,
  recordedByUserId: string,
): Promise<string> => {
  const customerId = randomUUID();
  const addressId = randomUUID();
  await dataSource.manager.getRepository(CustomerEntity).insert({
    id: customerId,
    warehouseId,
    name: `Test Customer ${customerId}`,
    deactivatedAt: null,
    recordedByUserId,
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(CustomerDeliveryAddressEntity).insert({
    id: addressId,
    customerId,
    warehouseId,
    addressText: 'Test Address 1, Test City',
    accessNotes: null,
    isMain: true,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return addressId;
};

const seedPurchaseDraftLine = async (
  purchaseDraftId: string,
  warehouseId: string,
  itemId: string,
  overrides: {
    orderedQuantity?: number;
    deliveryMode?: PurchaseDraftLineDeliveryMode;
    customerDeliveryAddressId?: string | null;
  } = {},
): Promise<string> => {
  const id = randomUUID();
  const deliveryMode = overrides.deliveryMode ?? 'via_warehouse';
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
    id,
    purchaseDraftId,
    warehouseId,
    itemId,
    orderedQuantity: overrides.orderedQuantity ?? 10,
    packagingTypeId: null,
    valueAddingNote: null,
    deliveryMode,
    customerDeliveryAddressId: overrides.customerDeliveryAddressId ?? null,
    frozenDeliveryAddressText: null,
    frozenAccessNotes: null,
    frozenCustomerName: null,
    endingQuantity: null,
    endingKind: null,
    endingRecordedByUserId: null,
    endingRecordedAt: null,
    preReceiptConformance: null,
    preReceiptConformanceNote: null,
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

const findRow = (rows: readonly CoverageGapRowRead[], itemId: string) =>
  rows.find((row) => row.itemId === itemId);

// Reads the week-in-progress boundary straight from PostgreSQL rather than computing it in JS,
// so a test's expectation is derived the same way `date_trunc('week', now() AT TIME ZONE $tz)`
// derives it in the statement under test (data-model.md § "Time, timezone and the week").
const fetchWeekStart = async (timezone: string): Promise<string> => {
  const [row] = (await dataSource.query(
    `SELECT date_trunc('week', now() AT TIME ZONE $1)::date::text AS week_start`,
    [timezone],
  )) as { week_start: string }[];
  return row.week_start;
};

const fetchTodayDate = async (timezone: string): Promise<string> => {
  const [row] = (await dataSource.query(
    `SELECT (now() AT TIME ZONE $1)::date::text AS today`,
    [timezone],
  )) as { today: string }[];
  return row.today;
};

// Pure calendar-date arithmetic over a `YYYY-MM-DD` string — safe because every date this spec
// carries (`needed_by`, `expected_arrival_date`) is a plain SQL `date`, never a zoned instant.
const addDays = (dateText: string, days: number): string => {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const sumBucketField = (
  buckets: readonly ArrivalTimingBucketRead[],
  field: 'owedQuantity' | 'expectedQuantity',
): number => buckets.reduce((total, bucket) => total + bucket[field], 0);

// The suites below are extracted to named top-level functions, each registering its own
// `describe`/`it`, so the outer `describe` callback stays a short table of contents
// (max-lines-per-function) — the pattern `consolidated-demand.repository.integration.spec.ts` uses.

const registerAggregationIntegrityTests = (): void => {
  // The headline defect (AC-06a, DoD "the headline case"): an Item with several Unfulfilled
  // Customer Orders **and** several open Purchase Draft Lines must report the exact same
  // quantities as an Item with one of each. A single fan-out JOIN across both one-to-many
  // relationships would multiply each aggregate's SUM by the other's row count — three Customer
  // Orders crossed with two Purchase Draft Lines produces six combined rows, so a naive
  // `SUM(outstanding_quantity)` over that join doubles the outstanding total and a naive
  // `SUM(ordered_quantity)` triples the inbound total. Independently grouped CTEs cannot produce
  // that multiplication no matter how many rows are on either side.
  it('reports the same quantities for an Item with several Unfulfilled Customer Orders and several open Purchase Draft Lines as for an Item with one of each', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);

    const itemMany = await seedItem(warehouseId, { onHandQuantity: 0 });
    // Three Unfulfilled Customer Orders: 10 + 20 + 15 = 45.
    await seedCustomerOrder(warehouseId, itemMany.id, userId, {
      quantity: 10,
      outstandingQuantity: 10,
    });
    await seedCustomerOrder(warehouseId, itemMany.id, userId, {
      quantity: 20,
      outstandingQuantity: 20,
    });
    await seedCustomerOrder(warehouseId, itemMany.id, userId, {
      quantity: 15,
      outstandingQuantity: 15,
    });
    // Two open Purchase Draft Lines: 40 + 10 = 50.
    const draft1 = await seedPurchaseDraft(warehouseId, userId, 'draft');
    const draft2 = await seedPurchaseDraft(
      warehouseId,
      userId,
      'ready_for_ordering',
    );
    await seedPurchaseDraftLine(draft1, warehouseId, itemMany.id, {
      orderedQuantity: 40,
    });
    await seedPurchaseDraftLine(draft2, warehouseId, itemMany.id, {
      orderedQuantity: 10,
    });

    // An Item whose one Customer Order and one Purchase Draft Line already carry exactly the same
    // totals — the "one of each" baseline the DoD states.
    const itemOne = await seedItem(warehouseId, { onHandQuantity: 0 });
    await seedCustomerOrder(warehouseId, itemOne.id, userId, {
      quantity: 45,
      outstandingQuantity: 45,
    });
    const draft3 = await seedPurchaseDraft(warehouseId, userId, 'draft');
    await seedPurchaseDraftLine(draft3, warehouseId, itemOne.id, {
      orderedQuantity: 50,
    });

    const { result, queryCount } = await withQueryCount(() =>
      repository.readCoverageGap(warehouseId),
    );

    expect(queryCount).toBe(1);

    const rowMany = findRow(result.rows, itemMany.id);
    const rowOne = findRow(result.rows, itemOne.id);
    expect(rowMany).toBeDefined();
    expect(rowOne).toBeDefined();
    // The plain sums — not those sums multiplied by the other side's row count, which is exactly
    // the defect a fan-out join produces (6 combined rows would sum outstanding to 90, inbound to
    // 150).
    expect(rowMany?.totalOutstandingQuantity).toBe(45);
    expect(rowMany?.inboundQuantity).toBe(50);
    // Equal to the one-of-each baseline: three-and-two records beside each other report no
    // differently than one-and-one.
    expect(rowMany?.totalOutstandingQuantity).toBe(
      rowOne?.totalOutstandingQuantity,
    );
    expect(rowMany?.inboundQuantity).toBe(rowOne?.inboundQuantity);
  });

  // The isolation property the standing brief names directly: adding a row to *one* relation must
  // never move the figure the *other* relation's own CTE computes. This is the assertion most
  // likely to be written vacuously if the two aggregates are ever combined in one GROUP BY — a
  // single-CTE fan-out mutation makes exactly this test fail (see the mutation report).
  it('leaves the Inbound Quantity unchanged when the Item gains another Customer Order, and leaves the Outstanding Quantity unchanged when the Item gains another Purchase Draft Line', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const item = await seedItem(warehouseId, { onHandQuantity: 0 });

    await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 20,
      outstandingQuantity: 20,
    });
    const draft = await seedPurchaseDraft(warehouseId, userId, 'draft');
    await seedPurchaseDraftLine(draft, warehouseId, item.id, {
      orderedQuantity: 30,
    });

    const before = await repository.readCoverageGap(warehouseId);
    const rowBefore = findRow(before.rows, item.id);
    expect(rowBefore?.totalOutstandingQuantity).toBe(20);
    expect(rowBefore?.inboundQuantity).toBe(30);

    // Add a row to `customer_orders` only — `inboundQuantity` must not move.
    await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 5,
      outstandingQuantity: 5,
    });
    const afterOrder = await repository.readCoverageGap(warehouseId);
    const rowAfterOrder = findRow(afterOrder.rows, item.id);
    expect(rowAfterOrder?.totalOutstandingQuantity).toBe(25);
    expect(rowAfterOrder?.inboundQuantity).toBe(30);

    // Add a row to `purchase_draft_lines` only — `totalOutstandingQuantity` must not move.
    await seedPurchaseDraftLine(draft, warehouseId, item.id, {
      orderedQuantity: 7,
    });
    const afterLine = await repository.readCoverageGap(warehouseId);
    const rowAfterLine = findRow(afterLine.rows, item.id);
    expect(rowAfterLine?.totalOutstandingQuantity).toBe(25);
    expect(rowAfterLine?.inboundQuantity).toBe(37);
  });
};

const registerCancelledOrderExclusionTest = (): void => {
  // AC-04 — a cancelled Customer Order's retained outstanding quantity contributes to no Coverage
  // Gap figure.
  it("counts nothing from a cancelled Customer Order's retained outstanding quantity", async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const item = await seedItem(warehouseId, { onHandQuantity: 0 });

    await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 12,
      outstandingQuantity: 12,
      state: 'unfulfilled',
    });
    await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 8,
      outstandingQuantity: 8,
      state: 'cancelled',
      cancellationReason: 'Customer changed their mind',
      cancelledByUserId: userId,
      cancelledAt: now,
    });

    const result = await repository.readCoverageGap(warehouseId);
    const row = findRow(result.rows, item.id);

    expect(row?.totalOutstandingQuantity).toBe(12);
  });
};

const registerDeactivatedItemTest = (): void => {
  // AC-25 — a deactivated Item is shown with its quantities exactly as an active one; deactivation
  // withdraws nothing from what has already been promised.
  it('shows a deactivated Item with its outstanding and on-hand quantities exactly as it shows an active one', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);

    const activeItem = await seedItem(warehouseId, { onHandQuantity: 4 });
    await seedCustomerOrder(warehouseId, activeItem.id, userId, {
      quantity: 9,
      outstandingQuantity: 9,
    });

    const deactivatedItem = await seedItem(warehouseId, {
      onHandQuantity: 4,
      deactivatedAt: now,
    });
    await seedCustomerOrder(warehouseId, deactivatedItem.id, userId, {
      quantity: 9,
      outstandingQuantity: 9,
    });

    const result = await repository.readCoverageGap(warehouseId);

    const activeRow = findRow(result.rows, activeItem.id);
    const deactivatedRow = findRow(result.rows, deactivatedItem.id);
    expect(deactivatedRow).toBeDefined();
    expect(deactivatedRow?.totalOutstandingQuantity).toBe(
      activeRow?.totalOutstandingQuantity,
    );
    expect(deactivatedRow?.onHandQuantity).toBe(activeRow?.onHandQuantity);
  });
};

const registerBothDeliveryModesTest = (): void => {
  // AC-08 — a Via Warehouse line and a Direct to Customer line on the same open draft both count
  // toward the Inbound Quantity, because goods sent straight to a customer answer that customer's
  // demand too.
  it('counts both a Via Warehouse line and a Direct to Customer line toward the Inbound Quantity', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const item = await seedItem(warehouseId, { onHandQuantity: 0 });
    await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 100,
      outstandingQuantity: 100,
    });

    const addressId = await seedCustomerDeliveryAddress(warehouseId, userId);
    const draft = await seedPurchaseDraft(warehouseId, userId, 'draft');
    await seedPurchaseDraftLine(draft, warehouseId, item.id, {
      orderedQuantity: 12,
      deliveryMode: 'via_warehouse',
    });
    await seedPurchaseDraftLine(draft, warehouseId, item.id, {
      orderedQuantity: 8,
      deliveryMode: 'direct_to_customer',
      customerDeliveryAddressId: addressId,
    });

    const result = await repository.readCoverageGap(warehouseId);
    const row = findRow(result.rows, item.id);

    expect(row?.inboundQuantity).toBe(20);
  });
};

const registerClosedDiscardedExclusionTest = (): void => {
  // AC-11 — a Closed or Discarded draft's lines count toward no Inbound Quantity.
  it('counts nothing from a Closed or Discarded draft toward the Inbound Quantity', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const item = await seedItem(warehouseId, { onHandQuantity: 0 });
    await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 100,
      outstandingQuantity: 100,
    });

    const openDraft = await seedPurchaseDraft(warehouseId, userId, 'draft');
    await seedPurchaseDraftLine(openDraft, warehouseId, item.id, {
      orderedQuantity: 15,
    });

    const closedDraft = await seedPurchaseDraft(warehouseId, userId, 'closed');
    await seedPurchaseDraftLine(closedDraft, warehouseId, item.id, {
      orderedQuantity: 40,
    });

    const discardedDraft = await seedPurchaseDraft(
      warehouseId,
      userId,
      'discarded',
    );
    await seedPurchaseDraftLine(discardedDraft, warehouseId, item.id, {
      orderedQuantity: 25,
    });

    const result = await repository.readCoverageGap(warehouseId);
    const row = findRow(result.rows, item.id);

    expect(row?.inboundQuantity).toBe(15);
  });
};

const registerInboundFromLineNotLinkTest = (): void => {
  // AC-06 — the Inbound Quantity is read from the line's ordered quantity, never from the stated
  // quantities on the links between that line and the Customer Orders it was meant for.
  it("reads the Inbound Quantity from the line's ordered quantity, never from a link's stated quantity", async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const item = await seedItem(warehouseId, { onHandQuantity: 0 });
    const orderOneId = await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 100,
      outstandingQuantity: 100,
    });
    const orderTwoId = await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 50,
      outstandingQuantity: 50,
    });

    const draft = await seedPurchaseDraft(warehouseId, userId, 'draft');
    const lineId = await seedPurchaseDraftLine(draft, warehouseId, item.id, {
      orderedQuantity: 30,
    });
    // The links' stated quantities deliberately do not add up to the line's ordered quantity
    // (5 + 2 = 7 vs. an ordered quantity of 30) — this is the DoD's own scenario. Two distinct
    // Customer Orders because `uq_purchase_draft_line_links_line_order` admits only one link per
    // (line, order) pair.
    await seedLink(lineId, draft, warehouseId, orderOneId, 5);
    await seedLink(lineId, draft, warehouseId, orderTwoId, 2);

    const result = await repository.readCoverageGap(warehouseId);
    const row = findRow(result.rows, item.id);

    expect(row?.inboundQuantity).toBe(30);
  });
};

const registerFullyCoveredTest = (): void => {
  // AC-05 — an Item whose On-hand and Inbound Quantities together meet or exceed its Outstanding
  // Quantity shows nothing uncovered rather than a negative or a surplus, and sorts below every
  // uncovered Item.
  it('shows a fully covered Item as having nothing uncovered rather than a negative quantity, sorted below an uncovered Item', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);

    const coveredItem = await seedItem(warehouseId, {
      onHandQuantity: 20,
      sku: 'SKU-COVERED',
    });
    await seedCustomerOrder(warehouseId, coveredItem.id, userId, {
      quantity: 10,
      outstandingQuantity: 10,
    });

    const uncoveredItem = await seedItem(warehouseId, {
      onHandQuantity: 0,
      sku: 'SKU-UNCOVERED',
    });
    await seedCustomerOrder(warehouseId, uncoveredItem.id, userId, {
      quantity: 5,
      outstandingQuantity: 5,
    });

    const result = await repository.readCoverageGap(warehouseId);
    const coveredRow = findRow(result.rows, coveredItem.id);
    const uncoveredRow = findRow(result.rows, uncoveredItem.id);

    expect(coveredRow?.uncoveredQuantity).toBe(0);
    const coveredIndex = result.rows.findIndex(
      (row) => row.itemId === coveredItem.id,
    );
    const uncoveredIndex = result.rows.findIndex(
      (row) => row.itemId === uncoveredItem.id,
    );
    expect(uncoveredRow?.uncoveredQuantity).toBe(5);
    expect(coveredIndex).toBeGreaterThan(uncoveredIndex);
  });
};

const registerRowBoundingAndRemainderTest = (): void => {
  // AC-03 — the eleventh Item onward is one Remainder Row stating its Item count, and the order is
  // stable across two reads of the same Warehouse.
  it('keeps at most ten named rows, rolls the eleventh Item onward into one Remainder Row stating its Item count, and reads the same order twice', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);

    // Twelve Items, each named by an Unfulfilled Customer Order, with strictly decreasing
    // Uncovered Quantity so the ordering is unambiguous.
    const itemIds: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      const item = await seedItem(warehouseId, {
        onHandQuantity: 0,
        sku: `SKU-${String(index).padStart(2, '0')}`,
      });
      itemIds.push(item.id);
      await seedCustomerOrder(warehouseId, item.id, userId, {
        quantity: 100 - index,
        outstandingQuantity: 100 - index,
      });
    }

    const first = await repository.readCoverageGap(warehouseId);
    expect(first.rows).toHaveLength(10);
    expect(first.remainder).not.toBeNull();
    expect(first.remainder?.itemCount).toBe(2);
    // The two Items with the smallest Uncovered Quantity (indexes 10 and 11, quantity 100 - index)
    // are the ones rolled up, so their combined outstanding is what the remainder states.
    expect(first.remainder?.totalOutstandingQuantity).toBe(90 + 89);

    const second = await repository.readCoverageGap(warehouseId);
    expect(second.rows.map((row) => row.itemId)).toEqual(
      first.rows.map((row) => row.itemId),
    );
    expect(second.remainder?.itemCount).toBe(first.remainder?.itemCount);
  });
};

const registerSortOrderTest = (): void => {
  // AC-03 — ordered by Uncovered Quantity descending, then total Outstanding Quantity descending
  // for a tie, then SKU ascending for a further tie — a total order.
  it('breaks a tie in Uncovered Quantity by total Outstanding Quantity, and a further tie by SKU', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);

    // Both Items uncovered by the same quantity (20), but Item B carries the larger Outstanding
    // Quantity and must sort first despite its higher SKU.
    const itemA = await seedItem(warehouseId, {
      onHandQuantity: 0,
      sku: 'SKU-A',
    });
    await seedCustomerOrder(warehouseId, itemA.id, userId, {
      quantity: 20,
      outstandingQuantity: 20,
    });

    const itemB = await seedItem(warehouseId, {
      onHandQuantity: 10,
      sku: 'SKU-B',
    });
    await seedCustomerOrder(warehouseId, itemB.id, userId, {
      quantity: 30,
      outstandingQuantity: 30,
    });

    const result = await repository.readCoverageGap(warehouseId);
    const indexA = result.rows.findIndex((row) => row.itemId === itemA.id);
    const indexB = result.rows.findIndex((row) => row.itemId === itemB.id);

    const rowA = result.rows[indexA];
    const rowB = result.rows[indexB];
    expect(rowA.uncoveredQuantity).toBe(20);
    expect(rowB.uncoveredQuantity).toBe(20);
    expect(indexB).toBeLessThan(indexA);
  });
};

// `WarehouseDemandCoverageRepository.readArrivalTiming` does not exist yet — this is the RED for
// T6, tasks/arrival-timing-repository.md, sad.md §6.4 (AC-07, AC-08, AC-08a, AC-11). The response
// shape is `openapi.yaml` `ArrivalTimingPanel`/`ArrivalTimingBucket`/`ArrivalTimingExclusions`.
const registerNineBucketsNeverNettedTest = (): void => {
  // AC-07 — exactly nine buckets, always: the `overdue` bucket then eight weeks beginning with the
  // week in progress, each present even where nothing falls in it. The demand and supply series
  // are never netted against one another — a bug that nets them would report bucket 1's
  // `owedQuantity` as `30 - 5 = 25` and its `expectedQuantity` as `0`, both wrong.
  it('reports exactly nine buckets, including empty ones, with the demand and supply series held independently rather than netted against one another', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const itemOne = await seedItem(warehouseId, { onHandQuantity: 0 });
    const itemTwo = await seedItem(warehouseId, { onHandQuantity: 0 });

    const weekStart = await fetchWeekStart('UTC');
    const weekTwoStart = addDays(weekStart, 7);

    // Week in progress: demand 30, supply 5 — never netted into a single figure.
    await seedCustomerOrder(warehouseId, itemOne.id, userId, {
      quantity: 30,
      outstandingQuantity: 30,
      neededBy: weekStart,
    });
    const draft = await seedPurchaseDraft(
      warehouseId,
      userId,
      'ready_for_ordering',
      weekStart,
    );
    await seedPurchaseDraftLine(draft, warehouseId, itemOne.id, {
      orderedQuantity: 5,
      deliveryMode: 'via_warehouse',
    });

    // The following week: demand only, no supply.
    await seedCustomerOrder(warehouseId, itemTwo.id, userId, {
      quantity: 20,
      outstandingQuantity: 20,
      neededBy: weekTwoStart,
    });

    const result = await repository.readArrivalTiming(warehouseId, 'UTC');

    expect(result.buckets).toHaveLength(9);
    expect(result.buckets[0].kind).toBe('overdue');
    expect(result.buckets[0].weekStart).toBeNull();
    for (let index = 1; index <= 8; index += 1) {
      expect(result.buckets[index].kind).toBe('week');
    }
    expect(result.buckets[1].weekStart).toBe(weekStart);
    expect(result.buckets[2].weekStart).toBe(weekTwoStart);

    expect(result.buckets[1].owedQuantity).toBe(30);
    expect(result.buckets[1].expectedQuantity).toBe(5);
    expect(result.buckets[2].owedQuantity).toBe(20);
    expect(result.buckets[2].expectedQuantity).toBe(0);

    // A bucket with nothing in it is still present and reports zero, never absent — indexes 0 and
    // 3 through 8 hold nothing here.
    for (const index of [0, 3, 4, 5, 6, 7, 8]) {
      expect(result.buckets[index].owedQuantity).toBe(0);
      expect(result.buckets[index].expectedQuantity).toBe(0);
    }
  });
};

const registerDirectToCustomerExclusionTest = (): void => {
  // AC-08 — a Direct to Customer line reaches no bucket here, while the sibling Via Warehouse line
  // on the same open draft counts toward this bucket, and both continue to count toward the
  // Coverage Gap's Inbound Quantity beside it.
  it('excludes a Direct to Customer line from every bucket while its sibling Via Warehouse line counts, though both still count toward the Coverage Gap Inbound Quantity', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const item = await seedItem(warehouseId, { onHandQuantity: 0 });
    const weekStart = await fetchWeekStart('UTC');
    // Coverage Gap's `outstanding` CTE only reports Items some Unfulfilled Customer Order still
    // asks for — seeded here purely so `readCoverageGap`'s side of this test has a row to find.
    await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 100,
      outstandingQuantity: 100,
    });

    const addressId = await seedCustomerDeliveryAddress(warehouseId, userId);
    const draft = await seedPurchaseDraft(
      warehouseId,
      userId,
      'ready_for_ordering',
      weekStart,
    );
    await seedPurchaseDraftLine(draft, warehouseId, item.id, {
      orderedQuantity: 9,
      deliveryMode: 'via_warehouse',
    });
    await seedPurchaseDraftLine(draft, warehouseId, item.id, {
      orderedQuantity: 40,
      deliveryMode: 'direct_to_customer',
      customerDeliveryAddressId: addressId,
    });

    const result = await repository.readArrivalTiming(warehouseId, 'UTC');

    expect(result.buckets[1].expectedQuantity).toBe(9);
    expect(sumBucketField(result.buckets, 'expectedQuantity')).toBe(9);

    const coverage = await repository.readCoverageGap(warehouseId);
    const row = findRow(coverage.rows, item.id);
    expect(row?.inboundQuantity).toBe(49);
  });
};

const registerLateReadyDraftInOverdueBucketTest = (): void => {
  // DoD — a Ready draft whose Expected Arrival Date has already passed lands in the first bucket,
  // beside the Overdue demand (the `tasks`-gate ruling of 2026-09-21, sad.md §6.4).
  it("places a Ready draft's already-passed Expected Arrival Date in the Overdue bucket, beside the Overdue demand", async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const item = await seedItem(warehouseId, { onHandQuantity: 0 });

    const today = await fetchTodayDate('UTC');
    const pastArrivalDate = addDays(today, -10);
    const pastNeededBy = addDays(today, -3);

    const draft = await seedPurchaseDraft(
      warehouseId,
      userId,
      'ready_for_ordering',
      pastArrivalDate,
    );
    await seedPurchaseDraftLine(draft, warehouseId, item.id, {
      orderedQuantity: 17,
      deliveryMode: 'via_warehouse',
    });
    await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 6,
      outstandingQuantity: 6,
      neededBy: pastNeededBy,
    });

    const result = await repository.readArrivalTiming(warehouseId, 'UTC');

    expect(result.buckets[0].kind).toBe('overdue');
    expect(result.buckets[0].owedQuantity).toBe(6);
    expect(result.buckets[0].expectedQuantity).toBe(17);
  });
};

const registerClosedOrDiscardedExclusionTest = (): void => {
  // AC-07 — a draft since Closed or Discarded counts toward no week, at read time, and is stated
  // only as its own exclusion count (`ArrivalTimingExclusions.draftsSinceClosedOrDiscarded`
  // carries no quantity — `openapi.yaml` required: [draftCount] only).
  it('counts a draft since Closed or Discarded toward no week and states only its own exclusion count', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const item = await seedItem(warehouseId, { onHandQuantity: 0 });
    const weekStart = await fetchWeekStart('UTC');

    const closedDraft = await seedPurchaseDraft(
      warehouseId,
      userId,
      'closed',
      weekStart,
    );
    await seedPurchaseDraftLine(closedDraft, warehouseId, item.id, {
      orderedQuantity: 11,
      deliveryMode: 'via_warehouse',
    });
    const discardedDraft = await seedPurchaseDraft(
      warehouseId,
      userId,
      'discarded',
      weekStart,
    );
    await seedPurchaseDraftLine(discardedDraft, warehouseId, item.id, {
      orderedQuantity: 22,
      deliveryMode: 'via_warehouse',
    });

    const result = await repository.readArrivalTiming(warehouseId, 'UTC');

    expect(sumBucketField(result.buckets, 'expectedQuantity')).toBe(0);
    expect(result.exclusions.draftsSinceClosedOrDiscarded.draftCount).toBe(2);
  });
};

const registerUndatedReadyDraftExclusionTest = (): void => {
  // AC-08a — a Ready draft carrying no Expected Arrival Date appears in no week and is stated as
  // its own exclusion, with both the draft count and the ordered quantity it covers.
  it('excludes an undated Ready draft from every week and states its own draft count and ordered quantity', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const item = await seedItem(warehouseId, { onHandQuantity: 0 });

    const draft = await seedPurchaseDraft(
      warehouseId,
      userId,
      'ready_for_ordering',
      null,
    );
    await seedPurchaseDraftLine(draft, warehouseId, item.id, {
      orderedQuantity: 14,
      deliveryMode: 'via_warehouse',
    });

    const result = await repository.readArrivalTiming(warehouseId, 'UTC');

    expect(sumBucketField(result.buckets, 'expectedQuantity')).toBe(0);
    expect(result.exclusions.undatedReadyDrafts.draftCount).toBe(1);
    expect(result.exclusions.undatedReadyDrafts.orderedQuantity).toBe(14);
  });
};

const registerDatedDraftStillInDraftExclusionTest = (): void => {
  // AC-08a — a Draft that already carries an Expected Arrival Date appears in no week — the date
  // is a working note rather than the commitment freezing makes of it — and is stated as its own
  // exclusion, with both the draft count and the ordered quantity it covers.
  it('excludes a dated draft still in Draft from every week and states its own draft count and ordered quantity', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const item = await seedItem(warehouseId, { onHandQuantity: 0 });
    const weekStart = await fetchWeekStart('UTC');

    const draft = await seedPurchaseDraft(
      warehouseId,
      userId,
      'draft',
      weekStart,
    );
    await seedPurchaseDraftLine(draft, warehouseId, item.id, {
      orderedQuantity: 33,
      deliveryMode: 'via_warehouse',
    });

    const result = await repository.readArrivalTiming(warehouseId, 'UTC');

    expect(sumBucketField(result.buckets, 'expectedQuantity')).toBe(0);
    expect(result.exclusions.datedDraftsStillInDraft.draftCount).toBe(1);
    expect(result.exclusions.datedDraftsStillInDraft.orderedQuantity).toBe(33);
  });
};

const registerBeyondHorizonExclusionTest = (): void => {
  // AC-07 — demand owed beyond the eighth week is placed in no bucket and stated as its own
  // exclusion: the owed quantity and how many Unfulfilled Customer Orders it covers.
  it('places demand beyond the eighth week in no bucket and states its own owed quantity and Customer Order count', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const item = await seedItem(warehouseId, { onHandQuantity: 0 });
    const weekStart = await fetchWeekStart('UTC');
    // Bucket 8 (the eighth week) covers `weekStart + 49` through `weekStart + 55`; one day beyond
    // that is beyond the horizon this Panel buckets at all.
    const beyondHorizonDate = addDays(weekStart, 56);

    await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 12,
      outstandingQuantity: 12,
      neededBy: beyondHorizonDate,
    });
    await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 9,
      outstandingQuantity: 9,
      neededBy: addDays(beyondHorizonDate, 30),
    });

    const result = await repository.readArrivalTiming(warehouseId, 'UTC');

    expect(sumBucketField(result.buckets, 'owedQuantity')).toBe(0);
    expect(result.exclusions.beyondHorizon.owedQuantity).toBe(21);
    expect(result.exclusions.beyondHorizon.customerOrderCount).toBe(2);
  });
};

const registerTimezoneBoundParameterTest = (): void => {
  // data-model.md § "Time, timezone and the week" — `APP_TIMEZONE` reaches this read as a **bound
  // query parameter**, never the connection's implicit `TimeZone` setting. Proven by driving one
  // repository instance with two zones guaranteed to disagree on "today" by exactly one calendar
  // day at any real instant the suite runs: `Pacific/Kiritimati` (UTC+14) and `Etc/GMT+12`
  // (POSIX sign-inverted, UTC-12) are 26 hours apart — wider than the 24-hour span a date boundary
  // spans — so the two readings can never agree, and the assertion needs no particular moment to
  // hold.
  it('reads the timezone as a bound parameter: the same needed-by date is not yet Overdue under one zone and already Overdue under another, 26 hours apart', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const item = await seedItem(warehouseId, { onHandQuantity: 0 });

    const earlierTimezone = 'Etc/GMT+12';
    const laterTimezone = 'Pacific/Kiritimati';
    const todayInEarlierZone = await fetchTodayDate(earlierTimezone);
    const todayInLaterZone = await fetchTodayDate(laterTimezone);
    expect(todayInLaterZone).toBe(addDays(todayInEarlierZone, 1));

    // Needed exactly "today" as the earlier zone reads it — not yet Overdue there, but already a
    // day in the past as the later zone reads it.
    await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 40,
      outstandingQuantity: 40,
      neededBy: todayInEarlierZone,
    });

    const underEarlierZone = await repository.readArrivalTiming(
      warehouseId,
      earlierTimezone,
    );
    const underLaterZone = await repository.readArrivalTiming(
      warehouseId,
      laterTimezone,
    );

    expect(underEarlierZone.buckets[0].owedQuantity).toBe(0);
    expect(underEarlierZone.buckets[1].owedQuantity).toBe(40);

    // Same connection, same repository instance — only the bound parameter changed — and the same
    // row now reads as Overdue.
    expect(underLaterZone.buckets[0].owedQuantity).toBe(40);
    expect(underLaterZone.buckets[1].owedQuantity).toBe(0);
  });
};

describe('WarehouseDemandCoverageRepository — readCoverageGap', () => {
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

  registerAggregationIntegrityTests();
  registerCancelledOrderExclusionTest();
  registerDeactivatedItemTest();
  registerBothDeliveryModesTest();
  registerClosedDiscardedExclusionTest();
  registerInboundFromLineNotLinkTest();
  registerFullyCoveredTest();
  registerRowBoundingAndRemainderTest();
  registerSortOrderTest();
});

describe('WarehouseDemandCoverageRepository — readArrivalTiming', () => {
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

  registerNineBucketsNeverNettedTest();
  registerDirectToCustomerExclusionTest();
  registerLateReadyDraftInOverdueBucketTest();
  registerClosedOrDiscardedExclusionTest();
  registerUndatedReadyDraftExclusionTest();
  registerDatedDraftStillInDraftExclusionTest();
  registerBeyondHorizonExclusionTest();
  registerTimezoneBoundParameterTest();
});
