import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source.js';
import { DbTransactionService } from 'shared/database/db-transaction.service.js';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service.js';
import { AccountEntity } from 'shared/domain/entities/account.entity.js';
import { ItemEntity } from 'shared/domain/entities/item.entity.js';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity.js';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity.js';
import {
  type PurchaseDraftLineRejectionDisposition,
  PurchaseDraftLineRejectionEntity,
} from 'shared/domain/entities/purchase-draft-line-rejection.entity.js';
import { UserEntity } from 'shared/domain/entities/user.entity.js';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity.js';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity.js';
// `PurchaseDraftRejectionRepository` does not exist yet (T4) — this is the RED for `sad.md` §6.4's
// persistence half. `data-model.md` § "Repository boundaries": it "resolves one Rejection in the
// acting Warehouse under lock **and** applies the amendment as one conditional update whose
// predicate excludes a return to Undecided. The two cannot be separated by another transaction,
// which is the whole point; a zero-row result is the typed refusal AC-18a needs."
import { PurchaseDraftRejectionRepository } from 'shared/domain/repositories/purchase-draft-rejection.repository.js';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories.js';
// Spied at the PostgreSQL round-trip level, as `arrival-confirmation.repository.integration.spec.ts`
// does: it is the one method every TypeORM access path reaches the database through, so the count
// and the text below describe the statements actually issued rather than the API chosen to issue
// them.
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner.js';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const now = new Date('2026-09-07T09:00:00.000Z');
const raisedAt = new Date('2026-09-07T10:00:00.000Z');
const amendedAt = new Date('2026-09-07T12:00:00.000Z');
const amendedAgainAt = new Date('2026-09-07T13:00:00.000Z');

// The shape this RED expects the implementer to expose (`data-model.md` § "Repository boundaries",
// `tasks/rejection-repositories.md`). Cast through it because the module does not exist yet.
interface LockedPurchaseDraftLineRejection {
  readonly id: string;
  readonly purchaseDraftLineId: string;
  readonly warehouseId: string;
  readonly disposition: PurchaseDraftLineRejectionDisposition;
  readonly description: string | null;
}

interface AmendRejectionInput {
  readonly rejectionId: string;
  readonly warehouseId: string;
  // Absent leaves the column exactly as it was; that is what makes AC-18b's description-only
  // amendment and AC-18's disposition-only amendment one method rather than two.
  readonly description?: string | null;
  readonly disposition?: PurchaseDraftLineRejectionDisposition;
  readonly amendedByUserId: string;
  readonly amendedAt: Date;
}

// `affected` is the row count the conditional update reported, not a flag derived from a pre-read:
// AC-18a's refusal *is* the zero, and `sad.md` §8's hard rule ("state transitions are conditional
// updates, not read-then-write") is only observable if the count is what crosses the boundary.
interface AmendRejectionResult {
  readonly affected: number;
}

interface PurchaseDraftRejectionRepositoryContract {
  lockRejectionForAmendment(
    rejectionId: string,
    warehouseId: string,
  ): Promise<LockedPurchaseDraftLineRejection | null>;
  amendRejection(input: AmendRejectionInput): Promise<AmendRejectionResult>;
}

const repository = new PurchaseDraftRejectionRepository(
  dataSource,
) as unknown as PurchaseDraftRejectionRepositoryContract;

const context = new DbTransactionContext(dataSource);
const transactions = new DbTransactionService(dataSource, context);

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
  readonly lineId: string;
}

/**
 * A Warehouse with one closed-out line whose ending is recorded — the only state a Rejection hangs
 * off (`chk_purchase_draft_lines_conformance_requires_ending`'s sibling rules, `sad.md` §6.4's
 * precondition). The draft is left Closed deliberately: §6.4 is the first write to a Closed draft in
 * this product, and the Rejection is the amendment's precondition, never the draft's state.
 */
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
    closedAt: raisedAt,
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
    endingRecordedAt: raisedAt,
    preReceiptConformance: null,
    preReceiptConformanceNote: null,
    createdAt: now,
    updatedAt: now,
  });

  return { warehouseId, userId, lineId };
};

interface RejectionOverrides {
  readonly disposition?: PurchaseDraftLineRejectionDisposition;
  readonly description?: string | null;
  readonly rejectionReasonId?: string;
  readonly amendedByUserId?: string | null;
  readonly amendedAt?: Date | null;
}

const seedRejection = async (
  seeded: Seeded,
  overrides: RejectionOverrides = {},
): Promise<string> => {
  const id = randomUUID();
  const amended =
    overrides.disposition !== undefined &&
    overrides.disposition !== 'undecided';
  await dataSource.manager
    .getRepository(PurchaseDraftLineRejectionEntity)
    .insert({
      id,
      purchaseDraftLineId: seeded.lineId,
      warehouseId: seeded.warehouseId,
      deliveryMode: 'via_warehouse',
      rejectionReasonId: overrides.rejectionReasonId ?? 'damaged_in_transit',
      quantity: 5,
      source: 'inspected',
      description: overrides.description ?? null,
      disposition: overrides.disposition ?? 'undecided',
      raisedByUserId: seeded.userId,
      amendedByUserId:
        overrides.amendedByUserId ?? (amended ? seeded.userId : null),
      amendedAt: overrides.amendedAt ?? (amended ? raisedAt : null),
      createdAt: raisedAt,
      updatedAt: raisedAt,
    });
  return id;
};

const readRejection = (
  id: string,
): Promise<PurchaseDraftLineRejectionEntity | null> =>
  dataSource.manager
    .getRepository(PurchaseDraftLineRejectionEntity)
    .findOneBy({ id });

const lockInTransaction = (
  rejectionId: string,
  warehouseId: string,
): Promise<LockedPurchaseDraftLineRejection | null> =>
  transactions.executeInTransaction({}, () =>
    repository.lockRejectionForAmendment(rejectionId, warehouseId),
  );

const amendInTransaction = (
  input: AmendRejectionInput,
): Promise<AmendRejectionResult> =>
  transactions.executeInTransaction({}, () => repository.amendRejection(input));

/** The SQL each call actually issued, with the transaction control statements dropped. */
const captureStatements = async <T>(
  operation: () => Promise<T>,
): Promise<{ result: T; statements: string[] }> => {
  const spy = vi.spyOn(PostgresQueryRunner.prototype, 'query');
  const before = spy.mock.calls.length;
  const result = await operation();
  const statements = spy.mock.calls
    .slice(before)
    .map((call) => String(call[0]))
    .filter(
      (sql) =>
        !/^(?:START TRANSACTION|SET TRANSACTION|COMMIT|ROLLBACK|BEGIN)/u.test(
          sql,
        ),
    );
  spy.mockRestore();
  return { result, statements };
};

/**
 * The plan of the exact statement the lock issued — captured rather than hand-reconstructed, then
 * re-`EXPLAIN`ed inside a transaction (a locking statement has no plan outside one).
 */
const explainLockStatement = async (
  rejectionId: string,
  warehouseId: string,
): Promise<string> => {
  const spy = vi.spyOn(PostgresQueryRunner.prototype, 'query');
  const before = spy.mock.calls.length;
  await lockInTransaction(rejectionId, warehouseId);
  const call = spy.mock.calls
    .slice(before)
    .find((candidate) => /FOR UPDATE/u.test(String(candidate[0])));
  spy.mockRestore();

  if (call === undefined) {
    throw new Error('the resolve issued no locking statement');
  }

  const rows = await dataSource.transaction(async (manager) => {
    await manager.query('SET LOCAL enable_seqscan = off');
    return manager.query<Array<Record<string, string>>>(
      `EXPLAIN ${String(call[0])}`,
      call[1] as unknown[] | undefined,
    );
  });

  return rows.map((row) => Object.values(row)[0]).join('\n');
};

const registerLockTests = (): void => {
  describe('lockRejectionForAmendment', () => {
    it('resolves the one Rejection of the acting Warehouse', async () => {
      const seeded = await seedWarehouseWithEndedLine();
      const rejectionId = await seedRejection(seeded, {
        description: 'Crushed on the pallet corner',
      });

      const locked = await lockInTransaction(rejectionId, seeded.warehouseId);

      expect(locked).toMatchObject({
        id: rejectionId,
        purchaseDraftLineId: seeded.lineId,
        warehouseId: seeded.warehouseId,
        disposition: 'undecided',
        description: 'Crushed on the pallet corner',
      });
    });

    // AC-26 — a Rejection of another Warehouse resolves to **no row**, indistinguishably from an
    // identifier that does not exist, so the caller's single refusal cannot disclose that it exists
    // elsewhere (`spec.md` §6.1, `sad.md` §6.4 step 3). The foreign row is real and readable by its
    // own Warehouse in the same test, so a repository that simply failed to find it would not pass.
    it('resolves no row for a Rejection of another Warehouse, as for one that does not exist', async () => {
      const acting = await seedWarehouseWithEndedLine();
      const other = await seedWarehouseWithEndedLine();
      const foreignRejectionId = await seedRejection(other);

      const foreign = await lockInTransaction(
        foreignRejectionId,
        acting.warehouseId,
      );
      const missing = await lockInTransaction(randomUUID(), acting.warehouseId);

      expect(foreign).toBeNull();
      expect(missing).toBeNull();
      expect(
        await lockInTransaction(foreignRejectionId, other.warehouseId),
      ).toMatchObject({ id: foreignRejectionId });
    });

    // `sad.md` §6.4 step 3 / `data-model.md` § "Concurrency, locks and transactions" — the resolve
    // takes the row lock, so the amendment that follows cannot be separated from it by another
    // transaction. PGlite has one backend, so the concurrent second amendment cannot be raced here;
    // the proof is the shape of the statement issued (`arrival-confirmation`'s precedent).
    it('takes the row lock the amendment is decided under', async () => {
      const seeded = await seedWarehouseWithEndedLine();
      const rejectionId = await seedRejection(seeded);

      const { statements } = await captureStatements(() =>
        lockInTransaction(rejectionId, seeded.warehouseId),
      );

      expect(statements).toHaveLength(1);
      expect(statements[0]).toMatch(/FOR UPDATE/u);
      expect(statements[0]).toMatch(/"purchase_draft_line_rejections"/u);
    });

    // `tasks/rejection-repositories.md` — the same resolve, read as a plan rather than as text: the
    // row lock is taken (`LockRows`) over a primary-key `Index Scan` with the acting Warehouse as a
    // filter, which is `data-model.md`'s stated access path for §6.4 ("a Rejection is fetched ... by
    // its own identifier for §6.4, both within one Warehouse"). `enable_seqscan` is forced off so a
    // plan that legitimately does not qualify for the index still reports a Seq Scan rather than
    // being masked by fixture-scale cost preference (`workspace-read`'s precedent).
    it('locks the row over a primary-key index scan filtered by the acting Warehouse', async () => {
      const seeded = await seedWarehouseWithEndedLine();
      const rejectionId = await seedRejection(seeded);

      const plan = await explainLockStatement(rejectionId, seeded.warehouseId);

      expect(plan).toMatch(/LockRows/u);
      expect(plan).toMatch(/Index Scan/u);
      expect(plan).toMatch(/warehouse_id/u);
      expect(plan).not.toMatch(/Seq Scan/u);
    });
  });
};

const registerAmendmentTests = (): void => {
  describe('amendRejection', () => {
    // AC-18 — the Disposition moves off Undecided with the acting member and the time, and nothing
    // else on the row moves: quantity, Reason, Source and line are unwritable after insert
    // (`sad.md` §7), and this write must not be what proves otherwise.
    it('affects one row and writes the amendment attribution when a decision is recorded', async () => {
      const seeded = await seedWarehouseWithEndedLine();
      const rejectionId = await seedRejection(seeded, {
        description: 'Crushed on the pallet corner',
      });

      const result = await amendInTransaction({
        rejectionId,
        warehouseId: seeded.warehouseId,
        disposition: 'held_for_return',
        amendedByUserId: seeded.userId,
        amendedAt,
      });

      expect(result.affected).toBe(1);
      expect(await readRejection(rejectionId)).toMatchObject({
        disposition: 'held_for_return',
        description: 'Crushed on the pallet corner',
        quantity: 5,
        rejectionReasonId: 'damaged_in_transit',
        source: 'inspected',
        purchaseDraftLineId: seeded.lineId,
        amendedByUserId: seeded.userId,
        amendedAt,
      });
    });

    // AC-18a — the refusal **is** the zero row count of the conditional update. Asserting the count
    // rather than a later read is what distinguishes "the predicate excluded it" from "the write
    // happened to be a no-op", and the single statement is what proves the exclusion was not a
    // comparison in TypeScript between a read and a write (`sad.md` §8's hard rule).
    it('affects zero rows in one statement when the Disposition is aimed back at Undecided', async () => {
      const seeded = await seedWarehouseWithEndedLine();
      const rejectionId = await seedRejection(seeded, {
        disposition: 'held_for_return',
        description: 'Crushed on the pallet corner',
      });

      const { result, statements } = await captureStatements(() =>
        amendInTransaction({
          rejectionId,
          warehouseId: seeded.warehouseId,
          disposition: 'undecided',
          amendedByUserId: seeded.userId,
          amendedAt,
        }),
      );

      expect(result.affected).toBe(0);
      expect(statements).toHaveLength(1);
      expect(statements[0]).toMatch(/^UPDATE/u);
      expect(await readRejection(rejectionId)).toMatchObject({
        disposition: 'held_for_return',
        amendedAt: raisedAt,
      });
    });

    // AC-18a's other half — "a Disposition once decided may be corrected to another decision", so
    // the predicate excludes the return to Undecided and nothing else. A predicate that made a
    // decision terminal would pass the test above and fail this one.
    it('affects one row when a decided Disposition is corrected to another decision', async () => {
      const seeded = await seedWarehouseWithEndedLine();
      const rejectionId = await seedRejection(seeded, {
        disposition: 'held_for_return',
      });

      const result = await amendInTransaction({
        rejectionId,
        warehouseId: seeded.warehouseId,
        disposition: 'scrapped_on_site',
        amendedByUserId: seeded.userId,
        amendedAt: amendedAgainAt,
      });

      expect(result.affected).toBe(1);
      expect(await readRejection(rejectionId)).toMatchObject({
        disposition: 'scrapped_on_site',
        amendedByUserId: seeded.userId,
        amendedAt: amendedAgainAt,
      });
    });

    // AC-18b — a description-only amendment records the prose with the acting member and the time
    // and leaves the Disposition exactly as it was, including where that Disposition is still
    // Undecided: an implementation defaulting the missing Disposition to `undecided` would write it
    // back through the same predicate and refuse a legitimate correction.
    it('records a description-only amendment and leaves the Disposition untouched', async () => {
      const seeded = await seedWarehouseWithEndedLine();
      const decided = await seedRejection(seeded, {
        disposition: 'held_for_return',
        description: 'Crushed on the pallet corner',
      });
      const undecided = await seedRejection(seeded, {
        rejectionReasonId: 'quality_defect',
        description: 'Seal split',
      });

      const decidedResult = await amendInTransaction({
        rejectionId: decided,
        warehouseId: seeded.warehouseId,
        description: 'Crushed across two pallet corners',
        amendedByUserId: seeded.userId,
        amendedAt,
      });
      const undecidedResult = await amendInTransaction({
        rejectionId: undecided,
        warehouseId: seeded.warehouseId,
        description: 'Seal split along the length',
        amendedByUserId: seeded.userId,
        amendedAt,
      });

      expect(decidedResult.affected).toBe(1);
      expect(undecidedResult.affected).toBe(1);
      expect(await readRejection(decided)).toMatchObject({
        description: 'Crushed across two pallet corners',
        disposition: 'held_for_return',
        quantity: 5,
        amendedByUserId: seeded.userId,
        amendedAt,
      });
      expect(await readRejection(undecided)).toMatchObject({
        description: 'Seal split along the length',
        disposition: 'undecided',
        amendedByUserId: seeded.userId,
        amendedAt,
      });
    });

    // AC-18/AC-18b — the description and the Disposition travel in the same statement when both are
    // amended, so no reader can observe one applied without the other.
    it('applies the description and the Disposition together in one statement', async () => {
      const seeded = await seedWarehouseWithEndedLine();
      const rejectionId = await seedRejection(seeded, {
        description: 'Crushed on the pallet corner',
      });

      const { result, statements } = await captureStatements(() =>
        amendInTransaction({
          rejectionId,
          warehouseId: seeded.warehouseId,
          description: 'Crushed across two pallet corners',
          disposition: 'refused_at_delivery',
          amendedByUserId: seeded.userId,
          amendedAt,
        }),
      );

      expect(result.affected).toBe(1);
      expect(statements).toHaveLength(1);
      expect(await readRejection(rejectionId)).toMatchObject({
        description: 'Crushed across two pallet corners',
        disposition: 'refused_at_delivery',
        amendedByUserId: seeded.userId,
        amendedAt,
      });
    });

    // AC-26 on the write path — the acting Warehouse is part of the predicate, not merely of the
    // pre-read, so an amendment aimed at another Warehouse's Rejection affects zero rows even if it
    // reached this method without one.
    it('affects zero rows for a Rejection of another Warehouse', async () => {
      const acting = await seedWarehouseWithEndedLine();
      const other = await seedWarehouseWithEndedLine();
      const foreignRejectionId = await seedRejection(other);

      const result = await amendInTransaction({
        rejectionId: foreignRejectionId,
        warehouseId: acting.warehouseId,
        disposition: 'held_for_return',
        amendedByUserId: acting.userId,
        amendedAt,
      });

      expect(result.affected).toBe(0);
      expect(await readRejection(foreignRejectionId)).toMatchObject({
        disposition: 'undecided',
        amendedByUserId: null,
        amendedAt: null,
      });
    });
  });
};

describe('PurchaseDraftRejectionRepository', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE purchase_draft_line_rejections, purchase_draft_lines, purchase_drafts, items, warehouses, workspaces, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  registerLockTests();
  registerAmendmentTests();
});
