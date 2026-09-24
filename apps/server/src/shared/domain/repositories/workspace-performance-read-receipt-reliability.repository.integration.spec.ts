import { randomUUID } from 'node:crypto';

// T10 RED — `readReceiptReliability` does not exist yet on `WorkspacePerformanceReadRepository`
// (T8 added `readDemandPressure`/`readPurchasingSpread`, T9 added `readOrderFlow`). Split into its
// own file rather than appended to `workspace-performance-read.repository.integration.spec.ts`:
// that file was already at 874 oxlint-counted code lines against the shared `max-lines` budget of
// 1000 (`packages/oxlint-config/src/base.ts`) before this task, leaving no room for a fourth Panel's
// coverage. Colocated in the same directory as the production file it covers, per
// `server-architecture.md § Testing` ("Colocate unit and integration test files with the production
// code they cover") — the guide does not require one file per production file, and this repository's
// own convention already re-declares each spec file's own seed helpers rather than sharing them
// (`arrival-confirmation.repository.integration.spec.ts`, `warehouse-demand-coverage.repository.integration.spec.ts`).
//
// The response shapes below are `openapi.yaml` `ReceiptReliabilityPanel` /
// `ReceiptReliabilityWarehouse` / `ReceiptReliabilityExclusions`, the source of truth this RED
// asserts against rather than an inferred shape.
import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerEntity } from 'shared/domain/entities/customer.entity';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import type { PurchaseDraftLineDeliveryMode } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { WorkspacePerformanceReadRepository } from 'shared/domain/repositories/workspace-performance-read.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
import { withQueryCount } from 'test/pglite/query-recorder';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const now = new Date('2026-09-21T10:00:00.000Z');
// `chk_warehouses_archival_order` rejects `archivedAt < createdAt`. `buildWarehouse` defaults
// `createdAt` to the real current instant, one minute behind this.
const archivedAtClock = new Date(Date.now() + 60_000);

// openapi.yaml `ReceiptReliabilityExclusions` — six independent, non-disjoint counts. "Five" in the
// task brief's prose undercounts the contract's own `required` array by one; this RED asserts
// against the schema.
interface ReceiptReliabilityExclusionsRead {
  readonly undatedLineCount: number;
  readonly noEndingRecordedLineCount: number;
  readonly nothingReceivedLineCount: number;
  readonly directToCustomerLineCount: number;
  readonly unrecordedConformanceLineCount: number;
  readonly notApplicableConformanceLineCount: number;
}

// openapi.yaml `ReceiptReliabilityWarehouse` — required: [warehouseId, warehouseName,
// onTimeArrivalRatePercent, conformanceRatePercent, receivedQuantity, exclusions]. Both rates are
// `[number, 'null']` — `null`, never `0`, when no line qualifies (AC-20a).
interface ReceiptReliabilityWarehouseRead {
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly onTimeArrivalRatePercent: number | null;
  readonly conformanceRatePercent: number | null;
  readonly receivedQuantity: number;
  readonly exclusions: ReceiptReliabilityExclusionsRead;
}

// openapi.yaml `ReceiptReliabilityPanel` — required: [archivedWarehouseCount, warehouses]. Every
// active Warehouse is a row, including one with no rate to report (AC-20a) — no Remainder Row.
interface ReceiptReliabilityPanelRead {
  readonly archivedWarehouseCount: number;
  readonly warehouses: readonly ReceiptReliabilityWarehouseRead[];
}

// Cast through this interface because `WorkspacePerformanceReadRepository` is `error`-typed while
// `readReceiptReliability` does not exist yet.
interface WorkspacePerformanceReadRepositoryContract {
  readReceiptReliability(
    workspaceId: string,
    timezone: string,
  ): Promise<ReceiptReliabilityPanelRead>;
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

const findWarehouse = <T extends { warehouseId: string }>(
  rows: readonly T[],
  warehouseId: string,
): T | undefined => rows.find((row) => row.warehouseId === warehouseId);

// Receipt Reliability's own seeding — a fixed calendar, never the real clock, because both the
// Expected Arrival Date and the ending's timestamp are values this suite asserts a rate against
// directly, unlike Order Flow's window (data-model.md "The read model": "whole retained record, no
// period bound").
const receiptDraftDefaultDate = '2026-09-19';

type PurchaseDraftState =
  'draft' | 'ready_for_ordering' | 'closed' | 'discarded';

interface SeedReceiptDraftOverrides {
  readonly expectedArrivalDate?: string | null;
  readonly state?: PurchaseDraftState;
}

const seedReceiptDraft = async (
  warehouseId: string,
  userId: string,
  overrides: SeedReceiptDraftOverrides = {},
): Promise<string> => {
  const id = randomUUID();
  const state = overrides.state ?? 'closed';
  const isReadied = state === 'ready_for_ordering' || state === 'closed';
  const isClosed = state === 'closed';
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id,
    warehouseId,
    state,
    expectedArrivalDate:
      overrides.expectedArrivalDate === undefined
        ? receiptDraftDefaultDate
        : overrides.expectedArrivalDate,
    createdByUserId: userId,
    readiedByUserId: isReadied ? userId : null,
    readiedAt: isReadied ? now : null,
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
    closedByUserId: isClosed ? userId : null,
    closedAt: isClosed ? now : null,
    closureReason: isClosed ? 'Every line ended' : null,
    discardedByUserId: null,
    discardedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

interface SeedReceiptEnding {
  readonly quantity: number;
  readonly recordedAt: Date;
  readonly recordedByUserId: string;
}

interface SeedReceiptLineOverrides {
  readonly deliveryMode?: PurchaseDraftLineDeliveryMode;
  readonly customerDeliveryAddressId?: string | null;
  readonly ending?: SeedReceiptEnding | null;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
  readonly preReceiptConformance?: 'met' | 'not_met' | 'not_applicable' | null;
}

// A Direct to Customer line's ending is a Direct Delivery, a Via Warehouse line's an Arrival
// (`chk_purchase_draft_lines_ending_matches_mode`) — derived from `deliveryMode` so a caller can
// never seed the one combination the schema refuses.
const seedReceiptLine = async (
  purchaseDraftId: string,
  warehouseId: string,
  itemId: string,
  overrides: SeedReceiptLineOverrides = {},
): Promise<string> => {
  const id = randomUUID();
  const deliveryMode = overrides.deliveryMode ?? 'via_warehouse';
  const ending = overrides.ending ?? null;
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
    id,
    purchaseDraftId,
    warehouseId,
    itemId,
    orderedQuantity: 10,
    packagingTypeId: overrides.packagingTypeId ?? null,
    valueAddingNote: overrides.valueAddingNote ?? null,
    deliveryMode,
    customerDeliveryAddressId: overrides.customerDeliveryAddressId ?? null,
    frozenDeliveryAddressText: null,
    frozenAccessNotes: null,
    frozenCustomerName: null,
    endingQuantity: ending?.quantity ?? null,
    endingKind: ending
      ? deliveryMode === 'via_warehouse'
        ? 'arrival'
        : 'direct_delivery'
      : null,
    endingRecordedByUserId: ending?.recordedByUserId ?? null,
    endingRecordedAt: ending?.recordedAt ?? null,
    preReceiptConformance: overrides.preReceiptConformance ?? null,
    preReceiptConformanceNote: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

// A Direct to Customer line must name a Customer Delivery Address
// (`chk_purchase_draft_lines_delivery_mode_address`), exactly as
// `warehouse-demand-coverage.repository.integration.spec.ts`'s own helper establishes.
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

const registerReceiptReliabilityRateTests = (): void => {
  describe('the two rates (AC-19, AC-20, AC-20b)', () => {
    it('computes the On-time Arrival Rate and the Conformance Rate off two genuinely different denominators, in one statement', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemId = await seedItem(warehouseId);
      const addressId = await seedCustomerDeliveryAddress(warehouseId, userId);
      const draftId = await seedReceiptDraft(warehouseId, userId);

      // On-time denominator: two Via Warehouse lines, one on time, one late — 1/2 = 50%.
      await seedReceiptLine(draftId, warehouseId, itemId, {
        packagingTypeId: 'cartons',
        preReceiptConformance: 'met',
        ending: {
          quantity: 10,
          recordedAt: new Date('2026-09-18T10:00:00.000Z'),
          recordedByUserId: userId,
        },
      });
      await seedReceiptLine(draftId, warehouseId, itemId, {
        ending: {
          quantity: 5,
          recordedAt: new Date('2026-09-25T10:00:00.000Z'),
          recordedByUserId: userId,
        },
      });

      // Conformance-only additions: three Direct to Customer lines, carrying a verdict each but
      // counting toward no on-time figure (AC-20b). Denominator 4 (the on-time-eligible line above
      // plus these three), met count 3 — 75%. A shared-denominator bug would divide this same met
      // count by the on-time denominator of 2, landing on 150% rather than 75%.
      for (const verdict of ['met', 'not_met', 'met'] as const) {
        await seedReceiptLine(draftId, warehouseId, itemId, {
          deliveryMode: 'direct_to_customer',
          customerDeliveryAddressId: addressId,
          packagingTypeId: 'cartons',
          preReceiptConformance: verdict,
          ending: {
            quantity: 7,
            recordedAt: new Date('2026-09-18T10:00:00.000Z'),
            recordedByUserId: userId,
          },
        });
      }

      const { result: panel, queryCount } = await withQueryCount(() =>
        repository.readReceiptReliability(workspaceId, 'UTC'),
      );

      expect(queryCount).toBe(1);
      const row = findWarehouse(panel.warehouses, warehouseId);
      expect(row?.onTimeArrivalRatePercent).toBe(50);
      expect(row?.conformanceRatePercent).toBe(75);
      // `receivedQuantity` — Via Warehouse lines whose ending recorded something only (10 + 5); the
      // three Direct to Customer lines never enter it (AC-20b).
      expect(row?.receivedQuantity).toBe(15);
    });

    it('reports no rate, not zero, for a Warehouse admitting no line into either rate (AC-20a)', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemId = await seedItem(warehouseId);
      const draftId = await seedReceiptDraft(warehouseId, userId);

      // A Via Warehouse line with no ending at all — nothing has yet said the goods reached the
      // dock.
      await seedReceiptLine(draftId, warehouseId, itemId);
      // A Via Warehouse line whose ending recorded that nothing was received.
      await seedReceiptLine(draftId, warehouseId, itemId, {
        ending: {
          quantity: 0,
          recordedAt: new Date('2026-09-18T10:00:00.000Z'),
          recordedByUserId: userId,
        },
      });
      // A Direct to Customer line carrying no verdict — excluded from the on-time rate by mode and
      // from the Conformance Rate by carrying nothing recorded.
      const addressId = await seedCustomerDeliveryAddress(warehouseId, userId);
      await seedReceiptLine(draftId, warehouseId, itemId, {
        deliveryMode: 'direct_to_customer',
        customerDeliveryAddressId: addressId,
        ending: {
          quantity: 5,
          recordedAt: new Date('2026-09-18T10:00:00.000Z'),
          recordedByUserId: userId,
        },
      });

      const panel = await repository.readReceiptReliability(workspaceId, 'UTC');

      const row = findWarehouse(panel.warehouses, warehouseId);
      // `null`, never `0` — a Warehouse with no admissible line is neither the worst performer nor
      // the best one (AC-20a). A `?? 0` coalesce in the implementation collapses this to `0` and
      // must fail this exact pair of assertions.
      expect(row?.onTimeArrivalRatePercent).toBeNull();
      expect(row?.conformanceRatePercent).toBeNull();
      expect(row?.receivedQuantity).toBe(0);
    });

    // `data-model.md § Time, timezone and the week`: `(ending_recorded_at AT TIME ZONE
    // $tz)::date <= expected_arrival_date`, bound through the repository call rather than asserted
    // by raw SQL, so a hardcoded zone in the query is what this proves against. Fixed instants
    // rather than the real clock (unlike Order Flow's boundary case), because Expected Arrival Date
    // and the ending's own timestamp are both values, not `now()`-derived. One line only, so the
    // denominator (1) never moves between the two calls — only the verdict does.
    it('judges the On-time Arrival Rate against the bound APP_TIMEZONE, asserted from both sides of the date boundary (AC-20b)', async () => {
      const workspaceId = await seedWorkspace();
      const warehouseId = await seedWarehouse(workspaceId);
      const userId = await seedUser(workspaceId);
      const itemId = await seedItem(warehouseId);
      const draftId = await seedReceiptDraft(warehouseId, userId, {
        expectedArrivalDate: '2026-09-19',
      });

      // `2026-09-19T20:00:00Z`: `Etc/GMT+12` (UTC-12) reads it as `2026-09-19` — on time.
      // `Pacific/Kiritimati` (UTC+14) reads the very same instant as `2026-09-20` — late.
      await seedReceiptLine(draftId, warehouseId, itemId, {
        ending: {
          quantity: 10,
          recordedAt: new Date('2026-09-19T20:00:00.000Z'),
          recordedByUserId: userId,
        },
      });

      const dateLineWestZone = 'Etc/GMT+12';
      const kiribatiZone = 'Pacific/Kiritimati';

      const fromEarlierZone = await repository.readReceiptReliability(
        workspaceId,
        dateLineWestZone,
      );
      const fromLaterZone = await repository.readReceiptReliability(
        workspaceId,
        kiribatiZone,
      );

      const earlierZoneRow = findWarehouse(
        fromEarlierZone.warehouses,
        warehouseId,
      );
      const laterZoneRow = findWarehouse(fromLaterZone.warehouses, warehouseId);

      expect(earlierZoneRow?.onTimeArrivalRatePercent).toBe(100);
      expect(laterZoneRow?.onTimeArrivalRatePercent).toBe(0);
    });
  });
};

// One Warehouse per exclusion, isolating each of the six counts as far as the schema allows — two
// pairs (`noEndingRecordedLineCount`/`nothingReceivedLineCount` each with
// `unrecordedConformanceLineCount`) are not disjoint by construction (`openapi.yaml`
// `ReceiptReliabilityExclusions`: "The six are not disjoint"), so both counts on those two rows are
// asserted together rather than as a bug.
interface ExclusionFixture {
  readonly name: string;
  readonly seedLine: (
    draftId: string,
    warehouseId: string,
    itemId: string,
    userId: string,
    addressId: string,
  ) => Promise<void>;
  readonly expected: Partial<ReceiptReliabilityExclusionsRead>;
  readonly onTimeArrivalRatePercent: number | null;
  readonly conformanceRatePercent: number | null;
}

const onTimeEnding: SeedReceiptEnding = {
  quantity: 9,
  recordedAt: new Date('2026-09-18T10:00:00.000Z'),
  recordedByUserId: '',
};

const exclusionFixtures: readonly ExclusionFixture[] = [
  {
    name: 'undated',
    seedLine: async (draftId, warehouseId, itemId, userId) => {
      await seedReceiptLine(draftId, warehouseId, itemId, {
        packagingTypeId: 'cartons',
        preReceiptConformance: 'met',
        ending: { ...onTimeEnding, recordedByUserId: userId },
      });
    },
    expected: { undatedLineCount: 1 },
    // Excluded from the on-time denominator only — the Conformance Rate is not restricted by
    // Expected Arrival Date (AC-20).
    onTimeArrivalRatePercent: null,
    conformanceRatePercent: 100,
  },
  {
    name: 'no ending recorded',
    seedLine: async (draftId, warehouseId, itemId) => {
      await seedReceiptLine(draftId, warehouseId, itemId);
    },
    expected: {
      noEndingRecordedLineCount: 1,
      unrecordedConformanceLineCount: 1,
    },
    onTimeArrivalRatePercent: null,
    conformanceRatePercent: null,
  },
  {
    name: 'nothing received',
    seedLine: async (draftId, warehouseId, itemId, userId) => {
      await seedReceiptLine(draftId, warehouseId, itemId, {
        ending: {
          quantity: 0,
          recordedAt: new Date('2026-09-18T10:00:00.000Z'),
          recordedByUserId: userId,
        },
      });
    },
    expected: {
      nothingReceivedLineCount: 1,
      unrecordedConformanceLineCount: 1,
    },
    onTimeArrivalRatePercent: null,
    conformanceRatePercent: null,
  },
  {
    name: 'direct to customer',
    seedLine: async (draftId, warehouseId, itemId, userId, addressId) => {
      await seedReceiptLine(draftId, warehouseId, itemId, {
        deliveryMode: 'direct_to_customer',
        customerDeliveryAddressId: addressId,
        packagingTypeId: 'cartons',
        preReceiptConformance: 'met',
        ending: { ...onTimeEnding, recordedByUserId: userId },
      });
    },
    expected: { directToCustomerLineCount: 1 },
    onTimeArrivalRatePercent: null,
    conformanceRatePercent: 100,
  },
  {
    name: 'unrecorded conformance',
    seedLine: async (draftId, warehouseId, itemId, userId) => {
      await seedReceiptLine(draftId, warehouseId, itemId, {
        ending: { ...onTimeEnding, recordedByUserId: userId },
      });
    },
    expected: { unrecordedConformanceLineCount: 1 },
    onTimeArrivalRatePercent: 100,
    conformanceRatePercent: null,
  },
  {
    name: 'not applicable',
    seedLine: async (draftId, warehouseId, itemId, userId) => {
      await seedReceiptLine(draftId, warehouseId, itemId, {
        preReceiptConformance: 'not_applicable',
        ending: { ...onTimeEnding, recordedByUserId: userId },
      });
    },
    expected: { notApplicableConformanceLineCount: 1 },
    onTimeArrivalRatePercent: 100,
    conformanceRatePercent: null,
  },
];

const zeroExclusions: ReceiptReliabilityExclusionsRead = {
  undatedLineCount: 0,
  noEndingRecordedLineCount: 0,
  nothingReceivedLineCount: 0,
  directToCustomerLineCount: 0,
  unrecordedConformanceLineCount: 0,
  notApplicableConformanceLineCount: 0,
};

const registerReceiptReliabilityExclusionTests = (): void => {
  describe('the six exclusion counts (AC-20)', () => {
    it("states each exclusion as the exact count of the rows it covers, one Warehouse per case so no other row's lines can pollute it", async () => {
      const workspaceId = await seedWorkspace();
      const userId = await seedUser(workspaceId);

      const warehouseIds = new Map<string, string>();
      for (const fixture of exclusionFixtures) {
        const warehouseId = await seedWarehouse(workspaceId);
        warehouseIds.set(fixture.name, warehouseId);
        const itemId = await seedItem(warehouseId);
        const addressId = await seedCustomerDeliveryAddress(
          warehouseId,
          userId,
        );
        const draftId = await seedReceiptDraft(warehouseId, userId, {
          expectedArrivalDate:
            fixture.name === 'undated' ? null : receiptDraftDefaultDate,
        });
        await fixture.seedLine(draftId, warehouseId, itemId, userId, addressId);
      }

      const panel = await repository.readReceiptReliability(workspaceId, 'UTC');

      for (const fixture of exclusionFixtures) {
        const warehouseId = warehouseIds.get(fixture.name);
        if (warehouseId === undefined) {
          throw new Error(`no seeded Warehouse for fixture ${fixture.name}`);
        }
        const row = findWarehouse(panel.warehouses, warehouseId);
        expect(row?.exclusions).toMatchObject({
          ...zeroExclusions,
          ...fixture.expected,
        });
        expect(row?.onTimeArrivalRatePercent).toBe(
          fixture.onTimeArrivalRatePercent,
        );
        expect(row?.conformanceRatePercent).toBe(
          fixture.conformanceRatePercent,
        );
      }
    });
  });
};

const registerReceiptReliabilityScopeTests = (): void => {
  describe('Workspace scope and row bounding (AC-19, AC-20a)', () => {
    it("reports the archived count, carries no Remainder Row, and keeps an idle Warehouse's null rates unaffected by an archived Warehouse's own record", async () => {
      const workspaceId = await seedWorkspace();
      const activeWarehouseId = await seedWarehouse(workspaceId);
      const idleWarehouseId = await seedWarehouse(workspaceId);
      const archivedWarehouseAId = await seedWarehouse(
        workspaceId,
        archivedAtClock,
      );
      const archivedWarehouseBId = await seedWarehouse(
        workspaceId,
        archivedAtClock,
      );
      const userId = await seedUser(workspaceId);
      const activeItemId = await seedItem(activeWarehouseId);
      const archivedItemId = await seedItem(archivedWarehouseAId);

      const activeDraftId = await seedReceiptDraft(activeWarehouseId, userId);
      await seedReceiptLine(activeDraftId, activeWarehouseId, activeItemId, {
        ending: {
          quantity: 4,
          recordedAt: new Date('2026-09-18T10:00:00.000Z'),
          recordedByUserId: userId,
        },
      });
      // A record on an archived Warehouse — must appear in no row and must never change the idle
      // Warehouse's own null rates (aggregation integrity, `spec.md` §6).
      const archivedDraftId = await seedReceiptDraft(
        archivedWarehouseAId,
        userId,
      );
      await seedReceiptLine(
        archivedDraftId,
        archivedWarehouseAId,
        archivedItemId,
        {
          ending: {
            quantity: 999,
            recordedAt: new Date('2026-09-18T10:00:00.000Z'),
            recordedByUserId: userId,
          },
        },
      );

      const panel = await repository.readReceiptReliability(workspaceId, 'UTC');

      expect(panel.archivedWarehouseCount).toBe(2);
      // Every active Warehouse is a row and nothing else is — no Remainder Row, whatever the count.
      expect(panel.warehouses).toHaveLength(2);
      const rowIds = panel.warehouses.map((row) => row.warehouseId);
      expect(rowIds).toContain(activeWarehouseId);
      expect(rowIds).toContain(idleWarehouseId);
      expect(rowIds).not.toContain(archivedWarehouseAId);
      expect(rowIds).not.toContain(archivedWarehouseBId);

      const idleRow = findWarehouse(panel.warehouses, idleWarehouseId);
      expect(idleRow?.onTimeArrivalRatePercent).toBeNull();
      expect(idleRow?.conformanceRatePercent).toBeNull();
      expect(idleRow?.receivedQuantity).toBe(0);
      expect(idleRow?.exclusions).toMatchObject(zeroExclusions);
    });
  });
};

describe('WorkspacePerformanceReadRepository — Receipt Reliability', () => {
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

  registerReceiptReliabilityRateTests();
  registerReceiptReliabilityExclusionTests();
  registerReceiptReliabilityScopeTests();
});
