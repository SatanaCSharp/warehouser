import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerEntity } from 'shared/domain/entities/customer.entity';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import type { PurchaseDraftLineDeliveryMode } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import type { PurchaseDraftLineRejectionDisposition } from 'shared/domain/entities/purchase-draft-line-rejection.entity';
import { PurchaseDraftLineRejectionEntity } from 'shared/domain/entities/purchase-draft-line-rejection.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
// `WarehouseRejectionReadRepository` does not exist yet (T7) — this is the RED for
// `tasks/warehouse-purchasing-and-rejection-repositories.md`'s Reason Concentration half.
// `sad.md` §6.5 / `data-model.md` § "The read model": one statement over
// `purchase_draft_line_rejections`, summed by `rejection_reason_id` under the Warehouse predicate,
// **both** Rejection Sources, ordered by refused quantity descending with the running share as a
// window function over that order, Undecided and Customer-reported quantity as two independent
// columns, Reasons beyond the tenth rolled into one Remainder Row. The response shape mirrors
// `openapi.yaml` `ReasonConcentrationPanel`/`Row`/`Remainder`, minus `label` — `data-model.md` §
// "The read model" lists only `rejection_reason_id`, `quantity`, `disposition` and `delivery_mode`
// as the columns this statement reads, and `api-sync-report.md` § Finding 1 records `label` as an
// open contract drift this task does not own.
import { WarehouseRejectionReadRepository } from 'shared/domain/repositories/warehouse-rejection-read.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
import type { RecordedStatement } from 'test/pglite/query-recorder';
import { recordQueries, withQueryCount } from 'test/pglite/query-recorder';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const now = new Date('2026-09-21T09:00:00.000Z');

interface ReasonConcentrationRow {
  readonly rejectionReasonId: string;
  readonly refusedQuantity: number;
  readonly sharePercent: number;
  readonly cumulativeSharePercent: number;
  readonly undecidedQuantity: number;
  readonly customerReportedQuantity: number;
}

interface ReasonConcentrationRemainder {
  readonly reasonCount: number;
  readonly refusedQuantity: number;
  readonly undecidedQuantity: number;
  readonly customerReportedQuantity: number;
}

interface ReasonConcentrationRead {
  readonly totalRefusedQuantity: number;
  readonly rows: readonly ReasonConcentrationRow[];
  readonly remainder: ReasonConcentrationRemainder | null;
}

// The shape this RED step expects the implementer to expose. Cast through this interface because
// `WarehouseRejectionReadRepository` is `error`-typed while the module does not exist yet (the
// idiom `consolidated-demand.repository.integration.spec.ts` establishes).
interface WarehouseRejectionReadRepositoryContract {
  readReasonConcentration(
    warehouseId: string,
  ): Promise<ReasonConcentrationRead>;
}

const repository = new WarehouseRejectionReadRepository(
  dataSource,
) as unknown as WarehouseRejectionReadRepositoryContract;

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

/** `accounts.user_id` / `users.account_id` are a deferred circular FK pair, so both land together. */
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
  readonly draftId: string;
}

const seedWarehouseWithDraft = async (): Promise<Seeded> => {
  const workspaceId = await seedWorkspace();
  const warehouseId = await seedWarehouse(workspaceId);
  const userId = await seedUser(workspaceId);

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

  const draftId = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id: draftId,
    warehouseId,
    state: 'closed',
    expectedArrivalDate: null,
    createdByUserId: userId,
    readiedByUserId: userId,
    readiedAt: now,
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
    closedByUserId: userId,
    closedAt: now,
    closureReason: null,
    discardedByUserId: null,
    discardedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return { warehouseId, userId, itemId, draftId };
};

/** A Customer Delivery Address, needed only by a Direct to Customer line. */
const seedCustomerDeliveryAddress = async (seeded: Seeded): Promise<string> => {
  const customerId = randomUUID();
  await dataSource.manager.getRepository(CustomerEntity).insert({
    id: customerId,
    warehouseId: seeded.warehouseId,
    name: `Customer ${customerId}`,
    deactivatedAt: null,
    recordedByUserId: seeded.userId,
    createdAt: now,
    updatedAt: now,
  });
  const addressId = randomUUID();
  await dataSource.manager.getRepository(CustomerDeliveryAddressEntity).insert({
    id: addressId,
    customerId,
    warehouseId: seeded.warehouseId,
    addressText: 'Test Address 1, Test City',
    accessNotes: null,
    isMain: true,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return addressId;
};

/**
 * Every line this spec seeds carries its own Rejection, one line per Rejection
 * (`uq_purchase_draft_line_rejections_line_reason`), so several Rejections against one Reason need
 * several lines — never a second Rejection on the same line.
 */
const seedLine = async (
  seeded: Seeded,
  deliveryMode: PurchaseDraftLineDeliveryMode,
  customerDeliveryAddressId: string | null = null,
): Promise<string> => {
  const lineId = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
    id: lineId,
    purchaseDraftId: seeded.draftId,
    warehouseId: seeded.warehouseId,
    itemId: seeded.itemId,
    orderedQuantity: 100,
    packagingTypeId: null,
    valueAddingNote: null,
    deliveryMode,
    customerDeliveryAddressId,
    frozenDeliveryAddressText: null,
    frozenAccessNotes: null,
    frozenCustomerName: null,
    endingQuantity: 100,
    endingKind:
      deliveryMode === 'via_warehouse' ? 'arrival' : 'direct_delivery',
    endingRecordedByUserId: seeded.userId,
    endingRecordedAt: now,
    preReceiptConformance: null,
    preReceiptConformanceNote: null,
    createdAt: now,
    updatedAt: now,
  });
  return lineId;
};

interface RejectionOverrides {
  readonly quantity?: number;
  readonly disposition?: PurchaseDraftLineRejectionDisposition;
  readonly source?: 'inspected' | 'customer_reported';
}

/**
 * Seeds one Rejection on a freshly seeded line, choosing the line's Delivery Mode from `source` —
 * `chk_purchase_draft_line_rejections_source_matches_mode` ties the two together, which is what
 * makes AC-12's "refused by the end customer" decidable from `delivery_mode` alone.
 */
const seedRejection = async (
  seeded: Seeded,
  rejectionReasonId: string,
  overrides: RejectionOverrides = {},
  customerDeliveryAddressId: string | null = null,
): Promise<void> => {
  const source = overrides.source ?? 'inspected';
  const deliveryMode: PurchaseDraftLineDeliveryMode =
    source === 'inspected' ? 'via_warehouse' : 'direct_to_customer';
  const lineId = await seedLine(
    seeded,
    deliveryMode,
    customerDeliveryAddressId,
  );

  await dataSource.manager
    .getRepository(PurchaseDraftLineRejectionEntity)
    .insert({
      id: randomUUID(),
      purchaseDraftLineId: lineId,
      warehouseId: seeded.warehouseId,
      deliveryMode,
      rejectionReasonId,
      quantity: overrides.quantity ?? 1,
      source,
      description: null,
      disposition: overrides.disposition ?? 'undecided',
      raisedByUserId: seeded.userId,
      amendedByUserId: null,
      amendedAt: null,
      createdAt: now,
      updatedAt: now,
    });
};

const rowOf = (
  read: ReasonConcentrationRead,
  rejectionReasonId: string,
): ReasonConcentrationRow | undefined =>
  read.rows.find((row) => row.rejectionReasonId === rejectionReasonId);

// The migration-seeded catalogue (`1786800000000-CreateArrivalInspectionSchema.ts`) holds exactly
// ten Reasons, so an eleventh distinct Reason for the row-bounding tests below is inserted directly
// — the catalogue is extend-only, and nothing this task owns forbids a test from widening it the
// way any future catalogue growth eventually would.
const seedCatalogueReason = async (id: string): Promise<void> => {
  await dataSource.query(
    `INSERT INTO rejection_reasons (id, label, requires_description, created_at, updated_at)
     VALUES ($1, $2, false, $3, $3)`,
    [id, `Synthetic reason ${id}`, now],
  );
};

const registerHappyPathTests = (): void => {
  // AC-12 happy path — ordering by refused quantity descending, the running share as a window
  // function over that order, both Rejection Sources counted, and the Undecided/Customer-reported
  // quantities reported as two independent columns rather than stacked segments so a Rejection that
  // is both is never double-counted (`sad.md` §6.5).
  it('orders Reasons by refused quantity with a running share, counts both Rejection Sources, and never double-counts a Rejection that is both Undecided and Customer-reported', async () => {
    const seeded = await seedWarehouseWithDraft();

    // damaged_in_transit: 7 (inspected, undecided) + 5 (customer_reported, still undecided) = 12.
    // The customer_reported line is also still Undecided, so it belongs to BOTH independent
    // columns at once — the exact case AC-12 requires never collapse into one.
    await seedRejection(seeded, 'damaged_in_transit', {
      quantity: 7,
      disposition: 'undecided',
      source: 'inspected',
    });
    const customerAddressId = await seedCustomerDeliveryAddress(seeded);
    await seedRejection(
      seeded,
      'damaged_in_transit',
      { quantity: 5, disposition: 'undecided', source: 'customer_reported' },
      customerAddressId,
    );

    // quality_defect: 3, decided (not Undecided), so it contributes to refusedQuantity but to
    // neither of the two independent columns.
    await seedRejection(seeded, 'quality_defect', {
      quantity: 3,
      disposition: 'scrapped_on_site',
      source: 'inspected',
    });

    const { result: read, queryCount } = await withQueryCount(() =>
      repository.readReasonConcentration(seeded.warehouseId),
    );

    expect(queryCount).toBe(1);
    expect(read.totalRefusedQuantity).toBe(15);

    // Largest first: damaged_in_transit (12) ahead of quality_defect (3).
    expect(read.rows.map((row) => row.rejectionReasonId)).toEqual([
      'damaged_in_transit',
      'quality_defect',
    ]);

    const damaged = rowOf(read, 'damaged_in_transit');
    expect(damaged?.refusedQuantity).toBe(12);
    // Both Rejection Sources folded into one total — the Direct to Customer exclusion governing the
    // dock figures does not govern this Panel (CONTEXT.md § Invariants).
    // undecidedQuantity and customerReportedQuantity are independent: the 5 customer-reported units
    // are undecided too, so both columns carry them and neither is reduced by the other.
    expect(damaged?.undecidedQuantity).toBe(12);
    expect(damaged?.customerReportedQuantity).toBe(5);

    const quality = rowOf(read, 'quality_defect');
    expect(quality?.refusedQuantity).toBe(3);
    expect(quality?.undecidedQuantity).toBe(0);
    expect(quality?.customerReportedQuantity).toBe(0);

    // The running share, as a window function over the descending order: damaged_in_transit alone
    // is 12/15 = 80%, and cumulative after quality_defect reaches the full 100%.
    expect(damaged?.sharePercent).toBeCloseTo(80, 1);
    expect(damaged?.cumulativeSharePercent).toBeCloseTo(80, 1);
    expect(quality?.sharePercent).toBeCloseTo(20, 1);
    expect(quality?.cumulativeSharePercent).toBeCloseTo(100, 1);

    expect(read.remainder).toBeNull();
  });
};

const registerRowBoundingTests = (): void => {
  // Row bounding (spec.md §6) — at most 10 named rows, one Remainder Row beyond that, and **no**
  // Remainder Row at all while nothing has been gathered into it (AC-12).
  it('presents no Remainder Row for exactly ten Reasons', async () => {
    const seeded = await seedWarehouseWithDraft();
    const reasonIds = [
      'damaged_in_transit',
      'damaged_by_packing',
      'quality_defect',
      'wrong_item_supplied',
      'short_within_packaging',
      'packaging_not_as_instructed',
      'value_adding_note_not_applied',
      'shelf_life_insufficient',
      'documentation_missing',
      'unfit_other',
    ];
    for (const [index, reasonId] of reasonIds.entries()) {
      await seedRejection(seeded, reasonId, { quantity: index + 1 });
    }

    const read = await repository.readReasonConcentration(seeded.warehouseId);

    expect(read.rows).toHaveLength(10);
    expect(read.remainder).toBeNull();
  });

  // The Remainder Row's own arithmetic — reasonCount and every quantity column must equal the sum
  // of exactly the Reasons that did not make the top ten, never the top ten's, and never a
  // double-count of either (this is the assertion the mutation below is built to catch).
  it('gathers the eleventh Reason into one Remainder Row stating its own count and quantities', async () => {
    const seeded = await seedWarehouseWithDraft();
    const topTen = [
      'damaged_in_transit',
      'damaged_by_packing',
      'quality_defect',
      'wrong_item_supplied',
      'short_within_packaging',
      'packaging_not_as_instructed',
      'value_adding_note_not_applied',
      'shelf_life_insufficient',
      'documentation_missing',
      'unfit_other',
    ];
    // Each of the top ten refuses more than the eleventh, so the eleventh is unambiguously the one
    // rolled up rather than merely the one seeded last.
    for (const [index, reasonId] of topTen.entries()) {
      await seedRejection(seeded, reasonId, { quantity: 100 - index });
    }

    const eleventhReasonId = 'synthetic_eleventh_reason';
    await seedCatalogueReason(eleventhReasonId);
    await seedRejection(seeded, eleventhReasonId, {
      quantity: 4,
      disposition: 'undecided',
    });
    const customerAddressId = await seedCustomerDeliveryAddress(seeded);
    await seedRejection(
      seeded,
      eleventhReasonId,
      {
        quantity: 3,
        source: 'customer_reported',
        disposition: 'held_for_return',
      },
      customerAddressId,
    );

    const read = await repository.readReasonConcentration(seeded.warehouseId);

    expect(read.rows).toHaveLength(10);
    expect(read.rows.map((row) => row.rejectionReasonId)).not.toContain(
      eleventhReasonId,
    );
    expect(read.remainder).toEqual({
      reasonCount: 1,
      refusedQuantity: 7,
      undecidedQuantity: 4,
      customerReportedQuantity: 3,
    });
  });
};

const registerAggregationIntegrityTests = (): void => {
  // spec.md §6 "Aggregation integrity": a Rejection added under one Reason must not change any
  // other Reason's own aggregation — its `refusedQuantity`, `undecidedQuantity` and
  // `customerReportedQuantity`, each summed under that Reason's own `GROUP BY` — a fan-out or a
  // mis-grouped window function is exactly what this would catch. `sharePercent` and
  // `cumulativeSharePercent` are deliberately excluded from this check: both are defined against
  // `totalRefusedQuantity`, so a genuinely unrelated Reason growing the total changes them by
  // design (AC-12), which is not the fan-out this property guards against.
  it("leaves every other Reason's own quantities unchanged when a Rejection is added to one Reason", async () => {
    const seeded = await seedWarehouseWithDraft();
    await seedRejection(seeded, 'damaged_in_transit', { quantity: 6 });
    await seedRejection(seeded, 'quality_defect', {
      quantity: 4,
      disposition: 'undecided',
    });

    const before = await repository.readReasonConcentration(seeded.warehouseId);
    const qualityBefore = rowOf(before, 'quality_defect');

    await seedRejection(seeded, 'damaged_in_transit', { quantity: 9 });

    const after = await repository.readReasonConcentration(seeded.warehouseId);
    const qualityAfter = rowOf(after, 'quality_defect');
    const damagedAfter = rowOf(after, 'damaged_in_transit');

    expect(qualityAfter?.refusedQuantity).toBe(qualityBefore?.refusedQuantity);
    expect(qualityAfter?.undecidedQuantity).toBe(
      qualityBefore?.undecidedQuantity,
    );
    expect(qualityAfter?.customerReportedQuantity).toBe(
      qualityBefore?.customerReportedQuantity,
    );
    expect(damagedAfter?.refusedQuantity).toBe(15);
  });
};

const registerIndexUsageTests = (): void => {
  // DoD — `EXPLAIN` shows `idx_purchase_draft_line_rejections_warehouse_reason` is used, proven
  // against the actual statement the repository issues (not a hand-reconstructed approximation of
  // it), `enable_seqscan` forced off so a plan that genuinely does not qualify for the index still
  // reports a Seq Scan instead of being masked by the planner's fixture-scale cost preference for
  // one — the idiom `purchase-draft-condition-read.repository.integration.spec.ts` and
  // `reason-concentration-index.integration.spec.ts` (T1) both establish.
  it('uses idx_purchase_draft_line_rejections_warehouse_reason for its own statement', async () => {
    const seeded = await seedWarehouseWithDraft();
    await seedRejection(seeded, 'damaged_in_transit', { quantity: 5 });
    await seedRejection(seeded, 'quality_defect', { quantity: 2 });

    const { statements } = await recordQueries(() =>
      repository.readReasonConcentration(seeded.warehouseId),
    );
    const grouping: RecordedStatement | undefined = statements.find(
      (statement) => /purchase_draft_line_rejections/u.test(statement.sql),
    );
    if (grouping === undefined) {
      throw new Error(
        'no statement against purchase_draft_line_rejections was captured',
      );
    }

    const plan = await dataSource.transaction(async (manager) => {
      await manager.query('SET LOCAL enable_seqscan = off');
      const rows = await manager.query<Array<Record<string, string>>>(
        `EXPLAIN ${grouping.sql}`,
        [...grouping.parameters],
      );
      return rows.map((row) => Object.values(row)[0]).join('\n');
    });

    expect(plan).toMatch(
      /idx_purchase_draft_line_rejections_warehouse_reason/u,
    );
  });
};

describe('WarehouseRejectionReadRepository', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      `TRUNCATE purchase_draft_line_rejections, purchase_draft_lines, purchase_drafts,
              customer_delivery_addresses, customers, items, warehouse_memberships, roles,
              warehouses, sessions, users, accounts, workspaces CASCADE`,
    );
    await dataSource.query(
      `DELETE FROM rejection_reasons WHERE id NOT IN (
        'damaged_in_transit', 'damaged_by_packing', 'quality_defect', 'wrong_item_supplied',
        'short_within_packaging', 'packaging_not_as_instructed', 'value_adding_note_not_applied',
        'shelf_life_insufficient', 'documentation_missing', 'unfit_other'
      )`,
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  registerHappyPathTests();
  registerRowBoundingTests();
  registerAggregationIntegrityTests();
  registerIndexUsageTests();
});
