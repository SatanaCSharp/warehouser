import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineRejectionEntity } from 'shared/domain/entities/purchase-draft-line-rejection.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
import { recordQueries } from 'test/pglite/query-recorder';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * The RED for T1 —
 * `docs/features/dashboards/tasks/reason-concentration-index-migration.md`.
 *
 * `apps/server/AGENTS.md` forbids tests for migration classes, so — exactly as
 * `arrival-inspection-schema.integration.spec.ts` and
 * `arrival-inspection-permissions.integration.spec.ts` do for their own schema tasks — the proof
 * lives here, against the already-migrated template this tier restores, and asserts only
 * observable database behaviour: the index exists with the stated name and column order, and a
 * Warehouse-wide read of the relation it covers has an access path to take.
 *
 * "The right access path" is proven the way
 * `purchase-draft-rejection.repository.integration.spec.ts` proves
 * `lockRejectionForAmendment`'s plan: `enable_seqscan` forced off, so a plan that genuinely does
 * not qualify for the index still reports a Seq Scan rather than being masked by the planner's
 * fixture-scale cost preference for one.
 *
 * The apply-with-data, revert and replay halves of the task's Definition of Done are not
 * expressible in this tier at all — it starts from an already-migrated template, and
 * `apps/server/AGENTS.md` forbids driving `runMigrations`/`undoLastMigration` from a spec. Those
 * are executed by hand against a database already holding Rejection rows, as the task's Notes and
 * `data-model.md` § Safe evolution describe.
 *
 * Covers AC-12.
 */
const now = new Date('2026-09-21T09:00:00.000Z');

interface Seeded {
  readonly warehouseId: string;
  readonly userId: string;
  readonly lineId: string;
}

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

/** A Warehouse with one closed-out line, the only state a Rejection hangs off. */
const seedWarehouseWithEndedLine = async (): Promise<Seeded> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  const warehouse = buildWarehouse({ workspaceId: workspace.id! });
  await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);
  const warehouseId = warehouse.id!;
  const userId = await seedUser(workspace.id!);

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

  const lineId = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
    id: lineId,
    purchaseDraftId: draftId,
    warehouseId,
    itemId,
    orderedQuantity: 100,
    packagingTypeId: null,
    valueAddingNote: null,
    deliveryMode: 'via_warehouse',
    customerDeliveryAddressId: null,
    frozenDeliveryAddressText: null,
    frozenAccessNotes: null,
    frozenCustomerName: null,
    endingQuantity: 100,
    endingKind: 'arrival',
    endingRecordedByUserId: userId,
    endingRecordedAt: now,
    preReceiptConformance: null,
    preReceiptConformanceNote: null,
    createdAt: now,
    updatedAt: now,
  });

  return { warehouseId, userId, lineId };
};

const seedRejection = async (
  seeded: Seeded,
  reasonId: string,
): Promise<void> => {
  await dataSource.manager
    .getRepository(PurchaseDraftLineRejectionEntity)
    .insert({
      id: randomUUID(),
      purchaseDraftLineId: seeded.lineId,
      warehouseId: seeded.warehouseId,
      deliveryMode: 'via_warehouse',
      rejectionReasonId: reasonId,
      quantity: 5,
      source: 'inspected',
      description: null,
      disposition: 'undecided',
      raisedByUserId: seeded.userId,
      amendedByUserId: null,
      amendedAt: null,
      createdAt: now,
      updatedAt: now,
    });
};

interface IndexRow {
  readonly indexname: string;
  readonly indexdef: string;
}

const readIndex = async (): Promise<IndexRow | undefined> => {
  const rows = (await dataSource.query(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE tablename = 'purchase_draft_line_rejections'
       AND indexname = 'idx_purchase_draft_line_rejections_warehouse_reason'`,
  )) as IndexRow[];

  return rows.at(0);
};

/**
 * The plan for a Warehouse-wide group-by over the relation, `EXPLAIN`ed with `enable_seqscan`
 * forced off — the access path the index has to supply, not merely the plan the planner happens
 * to prefer at fixture scale (`purchase-draft-rejection.repository.integration.spec.ts`'s
 * precedent for proving an access path exists rather than a cost preference).
 */
const explainReasonConcentrationGroupBy = async (
  warehouseId: string,
): Promise<string> => {
  const { statements } = await recordQueries(() =>
    dataSource.query(
      `SELECT rejection_reason_id, SUM(quantity)
       FROM purchase_draft_line_rejections
       WHERE warehouse_id = $1
       GROUP BY rejection_reason_id`,
      [warehouseId],
    ),
  );
  const grouped = statements.find((statement) =>
    /GROUP BY/u.test(statement.sql),
  );

  if (grouped === undefined) {
    throw new Error('the group-by issued no statement to re-plan');
  }

  const rows = await dataSource.transaction(async (manager) => {
    await manager.query('SET LOCAL enable_seqscan = off');

    return manager.query<Array<Record<string, string>>>(
      `EXPLAIN ${grouped.sql}`,
      [...grouped.parameters],
    );
  });

  return rows.map((row) => Object.values(row)[0]).join('\n');
};

describe('the Reason Concentration index', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      `TRUNCATE purchase_draft_line_rejections, purchase_draft_lines, purchase_drafts,
                items, warehouses, sessions, users, accounts, workspaces CASCADE`,
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('creates idx_purchase_draft_line_rejections_warehouse_reason over (warehouse_id, rejection_reason_id)', async () => {
    const index = await readIndex();

    expect(index).toBeDefined();
    expect(index?.indexdef).toMatch(/\(warehouse_id,\s*rejection_reason_id\)/u);
  });

  it('gives a Warehouse-wide group-by over the relation an access path, where none existed before', async () => {
    const seeded = await seedWarehouseWithEndedLine();
    await seedRejection(seeded, 'damaged_in_transit');
    await seedRejection(seeded, 'quality_defect');

    const plan = await explainReasonConcentrationGroupBy(seeded.warehouseId);

    expect(plan).not.toMatch(/Seq Scan/u);
    expect(plan).toMatch(
      /idx_purchase_draft_line_rejections_warehouse_reason/u,
    );
  });
});
