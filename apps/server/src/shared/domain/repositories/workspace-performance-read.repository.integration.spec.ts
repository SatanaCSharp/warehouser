import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
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

// The shape this RED step expects the implementer to expose (task DoD, data-model.md "Workspace
// surface", sad.md §6.6). Cast through this interface because `WorkspacePerformanceReadRepository`
// is `error`-typed while the module does not exist yet.
interface WorkspacePerformanceReadRepositoryContract {
  readDemandPressure(
    workspaceId: string,
    timezone: string,
  ): Promise<DemandPressurePanelRead>;
  readPurchasingSpread(workspaceId: string): Promise<PurchasingSpreadPanelRead>;
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
});
