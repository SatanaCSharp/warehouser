import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source';
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
// `WorkspacePerformanceReadRepository` does not exist yet (T8) — this is the RED for
// `docs/features/dashboards/tasks/workspace-performance-repository-foundation.md`: the shared
// active-Warehouse scope every Workspace Panel reads through, plus the two simplest Panels, Demand
// Pressure (AC-14) and Purchasing Spread (AC-18). data-model.md "Workspace surface" states the
// scope once for all four Panels: `warehouses WHERE workspace_id = $1 AND archived_at IS NULL`,
// with the archived count reported as a field of its own (`spec.md` §8 default). The response
// shapes below are `openapi.yaml` `DemandPressurePanel` / `PurchasingSpreadPanel`, the source of
// truth this RED asserts against rather than an inferred shape.
import { WorkspacePerformanceReadRepository } from 'shared/domain/repositories/workspace-performance-read.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
// Counts actual PostgreSQL round trips — the idiom
// `consolidated-demand.repository.integration.spec.ts` and `item-catalogue.repository.integration.spec.ts`
// establish for "one statement per Panel" (data-model.md "The read model").
import { withQueryCount } from 'test/pglite/query-recorder';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const now = new Date('2026-09-21T10:00:00.000Z');
// `chk_warehouses_archival_order` rejects `archivedAt < createdAt`. `buildWarehouse` defaults
// `createdAt` to the *real* current instant (`entity-factories.ts`'s own `new Date()`), not this
// file's fixed `now`, so the archival instant here is computed off the real clock too, one minute
// ahead of it — always after whatever `createdAt` the factory just stamped.
const archivedAtClock = new Date(Date.now() + 60_000);

// openapi.yaml `DemandPressureWarehouse` — required: [warehouseId, warehouseName, overdueQuantity,
// dueSoonQuantity, laterQuantity, totalOutstandingQuantity].
interface DemandPressureWarehouseRead {
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly overdueQuantity: number;
  readonly dueSoonQuantity: number;
  readonly laterQuantity: number;
  readonly totalOutstandingQuantity: number;
}

// openapi.yaml `DemandPressurePanel` — required: [archivedWarehouseCount, warehouses].
interface DemandPressurePanelRead {
  readonly archivedWarehouseCount: number;
  readonly warehouses: readonly DemandPressureWarehouseRead[];
}

type PurchaseDraftState =
  'draft' | 'ready_for_ordering' | 'closed' | 'discarded';

// openapi.yaml `PurchasingSpreadCell` — required: [state, draftCount].
interface PurchasingSpreadCellRead {
  readonly state: PurchaseDraftState;
  readonly draftCount: number;
}

// openapi.yaml `PurchasingSpreadWarehouse` — required: [warehouseId, warehouseName, counts],
// `counts` always exactly four entries, one per `PurchaseDraftState` (AC-18).
interface PurchasingSpreadWarehouseRead {
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly counts: readonly PurchasingSpreadCellRead[];
}

// openapi.yaml `PurchasingSpreadPanel` — required: [archivedWarehouseCount, warehouses].
interface PurchasingSpreadPanelRead {
  readonly archivedWarehouseCount: number;
  readonly warehouses: readonly PurchasingSpreadWarehouseRead[];
}

// openapi.yaml `OrderFlowWeek` — required: [weekStart, recordedQuantity, assignedQuantity,
// cancelledQuantity, stillAwaitedQuantity]. This is the T9 RED: `readOrderFlow` does not exist yet
// on `WorkspacePerformanceReadRepository` (T8 added only `readDemandPressure` and
// `readPurchasingSpread`). No `warehouseId`/`warehouseName` — Order Flow is the one Panel that
// pools across the Workspace and names no Warehouse (AC-16).
interface OrderFlowWeekRead {
  readonly weekStart: string;
  readonly recordedQuantity: number;
  readonly assignedQuantity: number;
  readonly cancelledQuantity: number;
  readonly stillAwaitedQuantity: number;
}

// openapi.yaml `OrderFlowPanel` — required: [timezone, archivedWarehouseCount, weeks].
interface OrderFlowPanelRead {
  readonly timezone: string;
  readonly archivedWarehouseCount: number;
  readonly weeks: readonly OrderFlowWeekRead[];
}

// The shape this RED step expects the implementer to expose (task DoD, data-model.md "Workspace
// surface", sad.md §6.6). Cast through this interface because `WorkspacePerformanceReadRepository`
// is `error`-typed while the module does not exist yet.
interface WorkspacePerformanceReadRepositoryContract {
  readDemandPressure(
    workspaceId: string,
    timezone: string,
  ): Promise<DemandPressurePanelRead>;
  readPurchasingSpread(workspaceId: string): Promise<PurchasingSpreadPanelRead>;
  readOrderFlow(
    workspaceId: string,
    timezone: string,
  ): Promise<OrderFlowPanelRead>;
}

const repository = new WorkspacePerformanceReadRepository(
  dataSource,
) as unknown as WorkspacePerformanceReadRepositoryContract;

const seedWorkspace = async (): Promise<string> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  return workspace.id as string;
};

const seedWarehouse = async (
  workspaceId: string,
  archivedAt: Date | null = null,
): Promise<string> => {
  const warehouse = buildWarehouse({ workspaceId, archivedAt });
  await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);
  return warehouse.id as string;
};

// `accounts.user_id` / `users.account_id` form a deferred circular FK pair, so both inserts must
// land inside the same transaction — the pattern every other integration spec under this directory
// uses.
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

const seedItem = async (warehouseId: string): Promise<string> => {
  const itemId = randomUUID();
  await dataSource.manager.getRepository(ItemEntity).insert({
    id: itemId,
    warehouseId,
    sku: `SKU-${itemId}`,
    description: 'Cable reel, 50m',
    unitOfMeasure: 'each',
    onHandQuantity: 0,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return itemId;
};

// Every Customer Order this suite seeds is Unfulfilled (Demand Pressure's own predicate,
// data-model.md "Workspace surface"), so `outstandingQuantity` always equals `quantity`.
const seedUnfulfilledCustomerOrder = async (
  warehouseId: string,
  itemId: string,
  recordedByUserId: string,
  quantity: number,
  neededBy: string,
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(CustomerOrderEntity).insert({
    id,
    warehouseId,
    itemId,
    customerName: 'Buyer One',
    quantity,
    outstandingQuantity: quantity,
    neededBy,
    state: 'unfulfilled',
    cancellationReason: null,
    recordedByUserId,
    cancelledByUserId: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

const seedPurchaseDraft = async (
  warehouseId: string,
  createdByUserId: string,
  state: PurchaseDraftState,
): Promise<string> => {
  const id = randomUUID();
  const isClosedByReason = state === 'closed';
  // `chk_purchase_drafts_readiness_attribution` — Ready for Ordering and Closed carry the readying
  // attribution; Draft and Discarded (only ever reached from Draft) never do.
  const isReadied = state === 'ready_for_ordering' || state === 'closed';
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id,
    warehouseId,
    state,
    expectedArrivalDate: null,
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

// Order Flow buckets on `customer_orders.created_at`, which the query windows against the real
// `now()` PostgreSQL reads at query time (data-model.md "The read model": "created_at >= twelve
// weeks ago") — not this file's fixed `now`, which every other fixture uses. So every Order Flow
// fixture is anchored to the *real* current instant instead.
const realNow = new Date();

// The UTC Monday (00:00) of the ISO week that is `weeksAgo` weeks before the real current week —
// `date_trunc('week', …)` is Monday-start (data-model.md "Time, timezone and the week"), so this is
// the same boundary the query computes, reproduced here in plain arithmetic rather than SQL.
const mondayOfWeek = (weeksAgo: number): Date => {
  const date = new Date(
    Date.UTC(
      realNow.getUTCFullYear(),
      realNow.getUTCMonth(),
      realNow.getUTCDate(),
    ),
  );
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday - weeksAgo * 7);
  return date;
};

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

// A `created_at` safely inside the interior of the week `weeksAgo` weeks ago — Wednesday noon UTC,
// far from either boundary, so reading it back under the `UTC` timezone this suite binds for its
// non-boundary cases always lands in that same week.
const createdAtInWeek = (weeksAgo: number): Date => {
  const at = mondayOfWeek(weeksAgo);
  at.setUTCDate(at.getUTCDate() + 2);
  at.setUTCHours(12, 0, 0, 0);
  return at;
};

interface CustomerOrderOverrides {
  readonly id?: string;
  readonly quantity?: number;
  readonly outstandingQuantity?: number;
  readonly neededBy?: string;
  readonly state?: 'unfulfilled' | 'fulfilled' | 'cancelled';
  readonly createdAt?: Date;
  readonly cancellationReason?: string | null;
  readonly cancelledByUserId?: string | null;
  readonly cancelledAt?: Date | null;
}

// Order Flow's own seeding function — unlike `seedUnfulfilledCustomerOrder`, it admits every state
// (AC-04, AC-16) and takes `createdAt` explicitly, because the week a Customer Order lands in is the
// one property under test.
const seedCustomerOrder = async (
  warehouseId: string,
  itemId: string,
  recordedByUserId: string,
  overrides: CustomerOrderOverrides,
): Promise<string> => {
  const id = overrides.id ?? randomUUID();
  const quantity = overrides.quantity ?? 100;
  await dataSource.manager.getRepository(CustomerOrderEntity).insert({
    id,
    warehouseId,
    itemId,
    customerName: 'Buyer One',
    quantity,
    outstandingQuantity: overrides.outstandingQuantity ?? quantity,
    neededBy: overrides.neededBy ?? '2099-01-01',
    state: overrides.state ?? 'unfulfilled',
    cancellationReason: overrides.cancellationReason ?? null,
    recordedByUserId,
    cancelledByUserId: overrides.cancelledByUserId ?? null,
    cancelledAt: overrides.cancelledAt ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.createdAt ?? now,
  });
  return id;
};

// The FK chain `arrival_allocations` needs: a Purchase Draft, one Line on it, and the Link the
// Allocation addresses (`arrival_allocations` composite-FKs onto
// `purchase_draft_line_links(id, purchase_draft_line_id, customer_order_id)` —
// `demand-allocation.repository.integration.spec.ts` establishes the same chain). One throwaway
// Purchase Draft per Allocation keeps each call independent of any other seeded in the same test.
const seedAllocation = async (
  warehouseId: string,
  itemId: string,
  userId: string,
  customerOrderId: string,
  allocatedQuantity: number,
  createdAt: Date,
): Promise<void> => {
  const purchaseDraftId = randomUUID();
  const purchaseDraftLineId = randomUUID();
  const linkId = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id: purchaseDraftId,
    warehouseId,
    state: 'ready_for_ordering',
    expectedArrivalDate: null,
    createdByUserId: userId,
    readiedByUserId: userId,
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
    warehouseId,
    itemId,
    orderedQuantity: allocatedQuantity,
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
    preReceiptConformance: null,
    preReceiptConformanceNote: null,
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(PurchaseDraftLineLinkEntity).insert({
    id: linkId,
    purchaseDraftLineId,
    purchaseDraftId,
    warehouseId,
    customerOrderId,
    statedQuantity: allocatedQuantity,
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(ArrivalAllocationEntity).insert({
    purchaseDraftLineLinkId: linkId,
    purchaseDraftLineId,
    customerOrderId,
    allocatedQuantity,
    allocatedByUserId: userId,
    createdAt,
  });
};

const findWeek = (
  weeks: readonly OrderFlowWeekRead[],
  weekStart: string,
): OrderFlowWeekRead | undefined =>
  weeks.find((week) => week.weekStart === weekStart);

const findWarehouse = <T extends { warehouseId: string }>(
  rows: readonly T[],
  warehouseId: string,
): T | undefined => rows.find((row) => row.warehouseId === warehouseId);

const findCell = (
  counts: readonly PurchasingSpreadCellRead[],
  state: PurchaseDraftState,
): PurchasingSpreadCellRead | undefined =>
  counts.find((cell) => cell.state === state);

// UTC-anchored day arithmetic, matching the timezone this suite binds for its non-boundary cases —
// `data-model.md § Time, timezone and the week` states `(now() AT TIME ZONE $tz)::date` as the
// "today" expression, and UTC is the one zone whose calendar date equals this test process's own
// `Date` arithmetic without conversion.
const isoDateOffsetFromToday = (days: number): string => {
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// The zoned "today" for a given IANA zone, computed off the *real* current instant — deliberately
// not the fixed `now` every other fixture in this file uses, because the repository's own
// `(now() AT TIME ZONE $tz)::date` reads PostgreSQL's real clock at query time, and only the real
// clock is guaranteed to agree with it. Used only to pick a `needed_by` that provably straddles the
// Urgency Band boundary for two zones whose UTC offsets are far enough apart (see below), never to
// assert a boundary against a fixed instant.
const zonedToday = (timezone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());

// Extracted to named top-level functions, each registering its own `describe`/`it`, so the outer
// `describe` callback stays a short table of contents (max-lines-per-function) — the pattern
// `consolidated-demand.repository.integration.spec.ts` establishes.

const registerDemandPressureTests = (): void => {
  describe('Demand Pressure (AC-14)', () => {
    it('reports outstanding quantity as an absolute figure per band, not a share, in one statement', async () => {
      const workspaceId = await seedWorkspace();
      const smallWarehouseId = await seedWarehouse(workspaceId);
      const largeWarehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const smallItem = await seedItem(smallWarehouseId);
      const largeItem = await seedItem(largeWarehouseId);

      // A small Warehouse in trouble (10 overdue) beside a large healthy one (400 due later) — if
      // the read normalized to shares, the small Warehouse's overdue figure would be squeezed to
      // near-zero rather than reading as the absolute 10 it is (AC-14).
      await seedUnfulfilledCustomerOrder(
        smallWarehouseId,
        smallItem,
        userId,
        10,
        isoDateOffsetFromToday(-5),
      );
      await seedUnfulfilledCustomerOrder(
        largeWarehouseId,
        largeItem,
        userId,
        400,
        isoDateOffsetFromToday(60),
      );

      const { result: panel, queryCount } = await withQueryCount(() =>
        repository.readDemandPressure(workspaceId, 'UTC'),
      );

      expect(queryCount).toBe(1);

      const smallWarehouse = findWarehouse(panel.warehouses, smallWarehouseId);
      const largeWarehouse = findWarehouse(panel.warehouses, largeWarehouseId);
      expect(smallWarehouse).toMatchObject({
        overdueQuantity: 10,
        dueSoonQuantity: 0,
        laterQuantity: 0,
        totalOutstandingQuantity: 10,
      });
      expect(largeWarehouse).toMatchObject({
        overdueQuantity: 0,
        dueSoonQuantity: 0,
        laterQuantity: 400,
        totalOutstandingQuantity: 400,
      });
    });

    it('places the Urgency Band boundary where the bound timezone puts today, asserted from both sides of it', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemId = await seedItem(warehouseId);

      // Offsets 26 hours apart — always at least a full calendar day apart regardless of the real
      // wall-clock instant the suite runs at (verified: UTC+14 and UTC-12 differ by 26h > 24h, so
      // `zonedToday(kiribatiZone)` is always strictly after `zonedToday(dateLineWestZone)`).
      const kiribatiZone = 'Pacific/Kiritimati';
      const dateLineWestZone = 'Etc/GMT+12';
      const earlierZoneToday = zonedToday(dateLineWestZone);
      const laterZoneToday = zonedToday(kiribatiZone);
      expect(laterZoneToday > earlierZoneToday).toBe(true);

      // A single Customer Order needed on the earlier zone's "today" — due, not overdue, from that
      // zone's own perspective, but strictly in the past (overdue) once "today" has already rolled
      // over to the later zone's date.
      await seedUnfulfilledCustomerOrder(
        warehouseId,
        itemId,
        userId,
        7,
        earlierZoneToday,
      );

      const fromEarlierZone = await repository.readDemandPressure(
        workspaceId,
        dateLineWestZone,
      );
      const fromLaterZone = await repository.readDemandPressure(
        workspaceId,
        kiribatiZone,
      );

      const earlierZoneRow = findWarehouse(
        fromEarlierZone.warehouses,
        warehouseId,
      );
      const laterZoneRow = findWarehouse(fromLaterZone.warehouses, warehouseId);

      // Due, from the zone whose "today" the order is needed on: not yet overdue.
      expect(earlierZoneRow?.overdueQuantity).toBe(0);
      // Overdue, from the zone whose "today" has already moved past that date — the same row, the
      // same needed-by date, a different bound timezone.
      expect(laterZoneRow?.overdueQuantity).toBe(7);
    });

    it('excludes an archived Warehouse from every row and reports it only in the archived count, while an in-scope Warehouse with nothing outstanding is still a row', async () => {
      const workspaceId = await seedWorkspace();
      const activeWarehouseId = await seedWarehouse(workspaceId);
      const idleWarehouseId = await seedWarehouse(workspaceId);
      const archivedWarehouseId = await seedWarehouse(
        workspaceId,
        archivedAtClock,
      );
      const otherWorkspaceId = await seedWorkspace();
      const otherWorkspaceWarehouseId = await seedWarehouse(otherWorkspaceId);
      const userId = await seedUser(workspaceId);
      const otherWorkspaceUserId = await seedUser(otherWorkspaceId);
      const activeItem = await seedItem(activeWarehouseId);
      const archivedItem = await seedItem(archivedWarehouseId);
      const otherWorkspaceItem = await seedItem(otherWorkspaceWarehouseId);

      await seedUnfulfilledCustomerOrder(
        activeWarehouseId,
        activeItem,
        userId,
        50,
        isoDateOffsetFromToday(3),
      );
      // Demand on the archived Warehouse — must appear in no row.
      await seedUnfulfilledCustomerOrder(
        archivedWarehouseId,
        archivedItem,
        userId,
        999,
        isoDateOffsetFromToday(-1),
      );
      // Demand on another Workspace's Warehouse — must never leak across the Workspace boundary
      // (AC-22), which a query missing its own `workspace_id` predicate would otherwise let through
      // even though it correctly filters `archived_at`.
      await seedUnfulfilledCustomerOrder(
        otherWorkspaceWarehouseId,
        otherWorkspaceItem,
        otherWorkspaceUserId,
        999,
        isoDateOffsetFromToday(-1),
      );

      const panel = await repository.readDemandPressure(workspaceId, 'UTC');

      expect(panel.archivedWarehouseCount).toBe(1);
      const rowIds = panel.warehouses.map((row) => row.warehouseId);
      expect(rowIds).toContain(activeWarehouseId);
      expect(rowIds).toContain(idleWarehouseId);
      expect(rowIds).not.toContain(archivedWarehouseId);
      expect(rowIds).not.toContain(otherWorkspaceWarehouseId);

      // Row bounding (`spec.md` §6): a Warehouse-keyed Panel presents every Warehouse the surface
      // shows, including one with nothing outstanding, and carries no Remainder Row — the idle
      // Warehouse is a real row with zero figures, not an omission.
      const idleRow = findWarehouse(panel.warehouses, idleWarehouseId);
      expect(idleRow).toMatchObject({
        overdueQuantity: 0,
        dueSoonQuantity: 0,
        laterQuantity: 0,
        totalOutstandingQuantity: 0,
      });
    });

    it('leaves one Warehouse’s totals unaffected when another Warehouse gains a Customer Order (aggregation integrity, spec.md §6)', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseAId = await seedWarehouse(workspaceId);
      const warehouseBId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemAId = await seedItem(warehouseAId);
      const itemBId = await seedItem(warehouseBId);

      await seedUnfulfilledCustomerOrder(
        warehouseAId,
        itemAId,
        userId,
        25,
        isoDateOffsetFromToday(2),
      );

      const before = await repository.readDemandPressure(workspaceId, 'UTC');
      const warehouseARowBefore = findWarehouse(
        before.warehouses,
        warehouseAId,
      );
      expect(warehouseARowBefore?.totalOutstandingQuantity).toBe(25);

      // A record unrelated to Warehouse A's own aggregation gains a row.
      await seedUnfulfilledCustomerOrder(
        warehouseBId,
        itemBId,
        userId,
        999,
        isoDateOffsetFromToday(2),
      );

      const after = await repository.readDemandPressure(workspaceId, 'UTC');
      const warehouseARowAfter = findWarehouse(after.warehouses, warehouseAId);
      expect(warehouseARowAfter?.totalOutstandingQuantity).toBe(25);
      expect(warehouseARowAfter?.overdueQuantity).toBe(0);
      expect(warehouseARowAfter?.dueSoonQuantity).toBe(25);
      expect(warehouseARowAfter?.laterQuantity).toBe(0);
    });
  });
};

const registerPurchasingSpreadTests = (): void => {
  describe('Purchasing Spread (AC-18)', () => {
    it('reports a count for every Warehouse x state pairing, including the empty ones, counting Closed and Discarded too', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);

      await seedPurchaseDraft(warehouseId, userId, 'draft');
      await seedPurchaseDraft(warehouseId, userId, 'draft');
      await seedPurchaseDraft(warehouseId, userId, 'ready_for_ordering');
      await seedPurchaseDraft(warehouseId, userId, 'closed');
      // No `discarded` draft is seeded — that pairing must still be a `0` cell, not an absent one.

      const { result: panel, queryCount } = await withQueryCount(() =>
        repository.readPurchasingSpread(workspaceId),
      );

      expect(queryCount).toBe(1);

      const row = findWarehouse(panel.warehouses, warehouseId);
      expect(row?.counts).toHaveLength(4);
      expect(findCell(row?.counts ?? [], 'draft')?.draftCount).toBe(2);
      expect(
        findCell(row?.counts ?? [], 'ready_for_ordering')?.draftCount,
      ).toBe(1);
      expect(findCell(row?.counts ?? [], 'closed')?.draftCount).toBe(1);
      expect(findCell(row?.counts ?? [], 'discarded')?.draftCount).toBe(0);
    });

    it('excludes an archived Warehouse from every row and reports it only in the archived count, while an in-scope Warehouse with no drafts is still a row', async () => {
      const workspaceId = await seedWorkspace();
      const activeWarehouseId = await seedWarehouse(workspaceId);
      const idleWarehouseId = await seedWarehouse(workspaceId);
      const archivedWarehouseId = await seedWarehouse(
        workspaceId,
        archivedAtClock,
      );
      const otherWorkspaceId = await seedWorkspace();
      const otherWorkspaceWarehouseId = await seedWarehouse(otherWorkspaceId);
      const userId = await seedUser(workspaceId);
      const otherWorkspaceUserId = await seedUser(otherWorkspaceId);

      await seedPurchaseDraft(activeWarehouseId, userId, 'draft');
      // Drafts on the archived Warehouse — must appear in no row.
      await seedPurchaseDraft(archivedWarehouseId, userId, 'discarded');
      // Drafts on another Workspace's Warehouse — must never leak across the Workspace boundary.
      await seedPurchaseDraft(
        otherWorkspaceWarehouseId,
        otherWorkspaceUserId,
        'draft',
      );

      const panel = await repository.readPurchasingSpread(workspaceId);

      expect(panel.archivedWarehouseCount).toBe(1);
      const rowIds = panel.warehouses.map((row) => row.warehouseId);
      expect(rowIds).toContain(activeWarehouseId);
      expect(rowIds).toContain(idleWarehouseId);
      expect(rowIds).not.toContain(archivedWarehouseId);
      expect(rowIds).not.toContain(otherWorkspaceWarehouseId);

      const idleRow = findWarehouse(panel.warehouses, idleWarehouseId);
      expect(idleRow?.counts).toHaveLength(4);
      for (const cell of idleRow?.counts ?? []) {
        expect(cell.draftCount).toBe(0);
      }
    });

    it('leaves one Warehouse’s counts unaffected when another Warehouse gains a Purchase Draft (aggregation integrity, spec.md §6)', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseAId = await seedWarehouse(workspaceId);
      const warehouseBId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);

      await seedPurchaseDraft(warehouseAId, userId, 'draft');

      const before = await repository.readPurchasingSpread(workspaceId);
      const warehouseARowBefore = findWarehouse(
        before.warehouses,
        warehouseAId,
      );
      expect(
        findCell(warehouseARowBefore?.counts ?? [], 'draft')?.draftCount,
      ).toBe(1);

      // A record unrelated to Warehouse A's own aggregation gains a row, in every state at once.
      await seedPurchaseDraft(warehouseBId, userId, 'draft');
      await seedPurchaseDraft(warehouseBId, userId, 'ready_for_ordering');
      await seedPurchaseDraft(warehouseBId, userId, 'closed');
      await seedPurchaseDraft(warehouseBId, userId, 'discarded');

      const after = await repository.readPurchasingSpread(workspaceId);
      const warehouseARowAfter = findWarehouse(after.warehouses, warehouseAId);
      expect(
        findCell(warehouseARowAfter?.counts ?? [], 'draft')?.draftCount,
      ).toBe(1);
      expect(
        findCell(warehouseARowAfter?.counts ?? [], 'ready_for_ordering')
          ?.draftCount,
      ).toBe(0);
      expect(
        findCell(warehouseARowAfter?.counts ?? [], 'closed')?.draftCount,
      ).toBe(0);
      expect(
        findCell(warehouseARowAfter?.counts ?? [], 'discarded')?.draftCount,
      ).toBe(0);
    });
  });
};

// Split from `registerOrderFlowWithdrawalTests` below (max-lines-per-function) — this half covers
// the window shape and the two additive-aggregation ACs (AC-17, AC-06a); the other half covers the
// amendment, cancellation and scope rules.
const registerOrderFlowWindowTests = (): void => {
  describe('Order Flow — window and aggregation (AC-06a, AC-17)', () => {
    it('reports exactly twelve pooled weeks, oldest first ending with the week in progress, a week with nothing recorded still reporting zero, in one statement', async () => {
      const workspaceId = await seedWorkspace();
      await seedWarehouse(workspaceId);

      const { result: panel, queryCount } = await withQueryCount(() =>
        repository.readOrderFlow(workspaceId, 'UTC'),
      );

      expect(queryCount).toBe(1);
      expect(panel.timezone).toBe('UTC');
      expect(panel.weeks).toHaveLength(12);
      expect(panel.weeks[0]?.weekStart).toBe(isoDate(mondayOfWeek(11)));
      expect(panel.weeks[11]?.weekStart).toBe(isoDate(mondayOfWeek(0)));
      for (const week of panel.weeks) {
        expect(week).toMatchObject({
          recordedQuantity: 0,
          assignedQuantity: 0,
          cancelledQuantity: 0,
          stillAwaitedQuantity: 0,
        });
      }
    });

    it('keys a week on when the Customer Order was recorded, never on its Needed By date', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemId = await seedItem(warehouseId);

      // Needed By is set far outside the twelve-week window entirely — an implementation that
      // buckets (or windows) on `needed_by` instead of `created_at` either drops this order from
      // every week or places it nowhere inside the twelve returned, rather than in the week it was
      // actually recorded.
      await seedCustomerOrder(warehouseId, itemId, userId, {
        quantity: 42,
        createdAt: createdAtInWeek(3),
        neededBy: '2099-01-01',
      });

      const panel = await repository.readOrderFlow(workspaceId, 'UTC');

      const recordingWeek = findWeek(panel.weeks, isoDate(mondayOfWeek(3)));
      expect(recordingWeek?.recordedQuantity).toBe(42);
      const total = panel.weeks.reduce(
        (sum, week) => sum + week.recordedQuantity,
        0,
      );
      expect(total).toBe(42);
    });

    it('adds three later Allocations together against the week the Customer Order was recorded, placing nothing in the three arrival weeks (AC-17)', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemId = await seedItem(warehouseId);

      const recordingWeek = 9;
      const orderId = await seedCustomerOrder(warehouseId, itemId, userId, {
        quantity: 100,
        outstandingQuantity: 0,
        state: 'fulfilled',
        createdAt: createdAtInWeek(recordingWeek),
      });
      const arrivalWeeks = [6, 4, 2];
      for (const arrivalWeek of arrivalWeeks) {
        await seedAllocation(
          warehouseId,
          itemId,
          userId,
          orderId,
          20,
          createdAtInWeek(arrivalWeek),
        );
      }

      const panel = await repository.readOrderFlow(workspaceId, 'UTC');

      const recordingWeekRow = findWeek(
        panel.weeks,
        isoDate(mondayOfWeek(recordingWeek)),
      );
      expect(recordingWeekRow?.assignedQuantity).toBe(60);
      for (const arrivalWeek of arrivalWeeks) {
        const arrivalWeekRow = findWeek(
          panel.weeks,
          isoDate(mondayOfWeek(arrivalWeek)),
        );
        expect(arrivalWeekRow?.assignedQuantity).toBe(0);
      }
      const totalAssigned = panel.weeks.reduce(
        (sum, week) => sum + week.assignedQuantity,
        0,
      );
      expect(totalAssigned).toBe(60);
    });

    it('reports the same recorded quantity for a Customer Order with three Allocations as one with none, unaffected by a row gained on the unrelated relation (AC-06a, aggregation integrity)', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemId = await seedItem(warehouseId);

      const week = 5;
      // Two Customer Orders of equal quantity, recorded in the same week: one that will gain three
      // Allocations and one that never does. `recordedQuantity` sums `quantity` **per order**, so
      // it must read the same for both regardless of how many Allocations either one carries — a
      // fan-out join to `arrival_allocations` would instead multiply the allocated order's own
      // `quantity` by its Allocation count and inflate the week's whole above 200.
      await seedCustomerOrder(warehouseId, itemId, userId, {
        quantity: 100,
        createdAt: createdAtInWeek(week),
      });
      const allocatedOrderId = await seedCustomerOrder(
        warehouseId,
        itemId,
        userId,
        {
          quantity: 100,
          outstandingQuantity: 50,
          createdAt: createdAtInWeek(week),
        },
      );

      const before = await repository.readOrderFlow(workspaceId, 'UTC');
      const beforeWeek = findWeek(before.weeks, isoDate(mondayOfWeek(week)));
      expect(beforeWeek?.recordedQuantity).toBe(200);
      expect(beforeWeek?.assignedQuantity).toBe(0);

      // A row on the unrelated relation — three Allocations against the allocated order — must
      // never change this week's whole (`recordedQuantity`), only its `assignedQuantity`.
      await seedAllocation(
        warehouseId,
        itemId,
        userId,
        allocatedOrderId,
        20,
        createdAtInWeek(week),
      );
      await seedAllocation(
        warehouseId,
        itemId,
        userId,
        allocatedOrderId,
        15,
        createdAtInWeek(week),
      );
      await seedAllocation(
        warehouseId,
        itemId,
        userId,
        allocatedOrderId,
        15,
        createdAtInWeek(week),
      );

      const after = await repository.readOrderFlow(workspaceId, 'UTC');
      const afterWeek = findWeek(after.weeks, isoDate(mondayOfWeek(week)));
      expect(afterWeek?.recordedQuantity).toBe(200);
      expect(afterWeek?.assignedQuantity).toBe(50);
    });
  });
};

const registerOrderFlowWithdrawalTests = (): void => {
  describe('Order Flow — amendment, cancellation and scope (AC-04, AC-16, AC-17a)', () => {
    it('reports the current quantity of a Customer Order amended upward eight weeks ago, in its old recording week (AC-17a)', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemId = await seedItem(warehouseId);

      const orderId = await seedCustomerOrder(warehouseId, itemId, userId, {
        quantity: 10,
        createdAt: createdAtInWeek(8),
      });
      // The amendment: nothing records what the order asked for before, only what it asks for now
      // (data-model.md "The read model").
      await dataSource.manager
        .getRepository(CustomerOrderEntity)
        .update({ id: orderId }, { quantity: 50, outstandingQuantity: 50 });

      const panel = await repository.readOrderFlow(workspaceId, 'UTC');

      const week = findWeek(panel.weeks, isoDate(mondayOfWeek(8)));
      expect(week?.recordedQuantity).toBe(50);
    });

    it('keeps a cancelled Customer Order in its recording week, presented as withdrawn rather than owed, reading the withdrawn part from outstanding_quantity and not the whole quantity (AC-04, AC-16)', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemId = await seedItem(warehouseId);

      const week = 4;
      // Cancelled after 60 of its 100 had already been assigned — `outstanding_quantity` (40) is
      // what the cancellation left uncovered; stating the whole `quantity` (100) as withdrawn would
      // double-count the 60 already assigned.
      const orderId = await seedCustomerOrder(warehouseId, itemId, userId, {
        quantity: 100,
        outstandingQuantity: 40,
        state: 'cancelled',
        createdAt: createdAtInWeek(week),
        cancellationReason: 'Customer no longer needs the goods',
        cancelledByUserId: userId,
        cancelledAt: createdAtInWeek(week),
      });
      await seedAllocation(
        warehouseId,
        itemId,
        userId,
        orderId,
        60,
        createdAtInWeek(week),
      );

      const panel = await repository.readOrderFlow(workspaceId, 'UTC');
      const weekRow = findWeek(panel.weeks, isoDate(mondayOfWeek(week)));

      expect(weekRow).toMatchObject({
        recordedQuantity: 100,
        assignedQuantity: 60,
        cancelledQuantity: 40,
        stillAwaitedQuantity: 0,
      });

      // The other half of AC-04: this cancelled order's retained quantity contributes to no owed
      // figure anywhere else on either surface — Demand Pressure's own `unfulfilled` predicate
      // already excludes it, asserted here directly rather than assumed.
      const demandPressure = await repository.readDemandPressure(
        workspaceId,
        'UTC',
      );
      const demandRow = findWarehouse(demandPressure.warehouses, warehouseId);
      expect(demandRow?.totalOutstandingQuantity).toBe(0);
    });

    it('excludes an archived Warehouse’s Customer Orders from every week and reports it only in the archived count', async () => {
      const workspaceId = await seedWorkspace();
      const activeWarehouseId = await seedWarehouse(workspaceId);
      const archivedWarehouseId = await seedWarehouse(
        workspaceId,
        archivedAtClock,
      );
      const userId = await seedUser(workspaceId);
      const activeItem = await seedItem(activeWarehouseId);
      const archivedItem = await seedItem(archivedWarehouseId);

      const week = 2;
      await seedCustomerOrder(activeWarehouseId, activeItem, userId, {
        quantity: 30,
        createdAt: createdAtInWeek(week),
      });
      await seedCustomerOrder(archivedWarehouseId, archivedItem, userId, {
        quantity: 999,
        createdAt: createdAtInWeek(week),
      });

      const panel = await repository.readOrderFlow(workspaceId, 'UTC');

      expect(panel.archivedWarehouseCount).toBe(1);
      const weekRow = findWeek(panel.weeks, isoDate(mondayOfWeek(week)));
      expect(weekRow?.recordedQuantity).toBe(30);
    });

    it('names no Warehouse anywhere in the response', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemId = await seedItem(warehouseId);
      await seedCustomerOrder(warehouseId, itemId, userId, {
        quantity: 5,
        createdAt: createdAtInWeek(1),
      });

      const panel = await repository.readOrderFlow(workspaceId, 'UTC');

      for (const week of panel.weeks) {
        expect(week).not.toHaveProperty('warehouseId');
        expect(week).not.toHaveProperty('warehouseName');
      }
    });

    // `APP_TIMEZONE` is a bound query parameter (data-model.md "Time, timezone and the week"), never
    // instance state. Offsets 26 hours apart, exactly as `readDemandPressure`'s own boundary test
    // uses, but placed near a *week* boundary rather than a day boundary: a single `created_at`
    // instant that reads as the tail of one ISO week from the earlier zone and as the head of the
    // next ISO week from the later zone, a full seven days apart — the one shift a 2–3 hour offset
    // could never produce.
    it('places the week boundary where the bound timezone puts it, asserted from both sides of it', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemId = await seedItem(warehouseId);

      const kiribatiZone = 'Pacific/Kiritimati';
      const dateLineWestZone = 'Etc/GMT+12';
      // Six hours before the UTC Monday of week 5-ago: `Etc/GMT+12` (UTC-12) reads this as Sunday
      // 06:00, still inside week 6-ago; `Pacific/Kiritimati` (UTC+14) reads it as Monday 08:00,
      // already inside week 5-ago.
      const boundaryInstant = mondayOfWeek(5);
      boundaryInstant.setUTCHours(-6);
      await seedCustomerOrder(warehouseId, itemId, userId, {
        quantity: 17,
        createdAt: boundaryInstant,
      });

      const fromEarlierZone = await repository.readOrderFlow(
        workspaceId,
        dateLineWestZone,
      );
      const fromLaterZone = await repository.readOrderFlow(
        workspaceId,
        kiribatiZone,
      );

      const earlierZoneWeek = findWeek(
        fromEarlierZone.weeks,
        isoDate(mondayOfWeek(6)),
      );
      const laterZoneWeek = findWeek(
        fromLaterZone.weeks,
        isoDate(mondayOfWeek(5)),
      );
      expect(earlierZoneWeek?.recordedQuantity).toBe(17);
      expect(laterZoneWeek?.recordedQuantity).toBe(17);
      // The same instant must not also land in the *other* zone's reading of that same week —
      // proof the boundary actually moved rather than both readings agreeing by coincidence.
      expect(
        findWeek(fromEarlierZone.weeks, isoDate(mondayOfWeek(5)))
          ?.recordedQuantity,
      ).toBe(0);
      expect(
        findWeek(fromLaterZone.weeks, isoDate(mondayOfWeek(6)))
          ?.recordedQuantity,
      ).toBe(0);
    });
  });
};

describe('WorkspacePerformanceReadRepository', () => {
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

  registerDemandPressureTests();
  registerPurchasingSpreadTests();
  registerOrderFlowWindowTests();
  registerOrderFlowWithdrawalTests();
});
