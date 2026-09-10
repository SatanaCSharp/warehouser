import { randomUUID } from 'node:crypto';

// R1 (review-2026-09-04 finding 39) — repointed from `lockDraftForArrival`/`confirmArrival`, the
// whole-draft methods T17 withdrew, onto `lockDraftLineForEnding`/`recordLineEnding`, the per-line
// write path those describes replaced without ever gaining their own repository-level integration
// coverage (ADR 0002, sad.md §6.9/§6.10/§8). Reading the draft header and then the one named line
// within it, in the composite tuple the fixed lock order and `uq_purchase_draft_lines_id_draft_warehouse`
// both name ("the draft row, then its lines, then the Customer Orders it touches in ascending
// identifier order", data-model.md "Concurrency, locks and transactions") — and writing the line's
// ending together with the draft's guarded closure, so a second ending on one line, or the last line
// of a draft, resolve on the same guarded-write terms `PurchaseDraftFreezeRepository.freeze`/`.close`
// already establish (T13's proven idiom).
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import type { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftEntity as PurchaseDraftEntityClass } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineRejectionEntity } from 'shared/domain/entities/purchase-draft-line-rejection.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import type {
  LockPurchaseDraftLineForEndingResult,
  RecordLineEndingConditionInput,
  RecordLineEndingInput,
  RecordLineEndingResult,
} from 'shared/domain/repositories/arrival-confirmation.repository';
import { ArrivalConfirmationRepository } from 'shared/domain/repositories/arrival-confirmation.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
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

const now = new Date('2026-08-26T10:00:00.000Z');
const later = new Date('2026-08-26T12:00:00.000Z');
const evenLater = new Date('2026-08-26T13:00:00.000Z');

const repository = new ArrivalConfirmationRepository(dataSource);

const context = new DbTransactionContext(dataSource);
const transactions = new DbTransactionService(dataSource, context);

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
}

const seedWarehouse = async (): Promise<Seeded> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  const warehouse = buildWarehouse({ workspaceId: workspace.id! });
  await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);
  const userId = await seedUser(workspace.id!);

  const itemId = randomUUID();
  await dataSource.manager.getRepository(ItemEntity).insert({
    id: itemId,
    warehouseId: warehouse.id!,
    sku: `SKU-${itemId}`,
    description: 'Cable reel, 50m',
    unitOfMeasure: 'each',
    onHandQuantity: 0,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return { warehouseId: warehouse.id!, userId, itemId };
};

const seedDraft = async (
  seeded: Seeded,
  state: PurchaseDraftEntity['state'] = 'ready_for_ordering',
): Promise<string> => {
  const id = randomUUID();
  const readied = state !== 'draft' && state !== 'discarded';
  await dataSource.manager.getRepository(PurchaseDraftEntityClass).insert({
    id,
    warehouseId: seeded.warehouseId,
    state,
    expectedArrivalDate: null,
    createdByUserId: seeded.userId,
    readiedByUserId: readied ? seeded.userId : null,
    readiedAt: readied ? now : null,
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
    closedByUserId: state === 'closed' ? seeded.userId : null,
    closedAt: state === 'closed' ? now : null,
    closureReason: null,
    discardedByUserId: state === 'discarded' ? seeded.userId : null,
    discardedAt: state === 'discarded' ? now : null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

interface SeedLineOverrides {
  readonly endingKind?: PurchaseDraftLineEntity['endingKind'];
  readonly endingQuantity?: number | null;
  readonly endingRecordedByUserId?: string | null;
  readonly endingRecordedAt?: Date | null;
  // AC-17/AC-17a — the frozen instruction the Pre-receipt Conformance is judged against. Seeded
  // here because the ending decides the verdict from the locked line alone.
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
}

const seedLine = async (
  seeded: Seeded,
  draftId: string,
  orderedQuantity = 100,
  overrides: SeedLineOverrides = {},
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
    id,
    purchaseDraftId: draftId,
    warehouseId: seeded.warehouseId,
    itemId: seeded.itemId,
    orderedQuantity,
    packagingTypeId: overrides.packagingTypeId ?? null,
    valueAddingNote: overrides.valueAddingNote ?? null,
    deliveryMode: 'via_warehouse',
    endingKind: overrides.endingKind ?? null,
    endingQuantity: overrides.endingQuantity ?? null,
    endingRecordedByUserId: overrides.endingRecordedByUserId ?? null,
    endingRecordedAt: overrides.endingRecordedAt ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

const readDraft = (id: string): Promise<PurchaseDraftEntity | null> =>
  dataSource.manager.getRepository(PurchaseDraftEntityClass).findOneBy({ id });

const readLine = (id: string): Promise<PurchaseDraftLineEntity | null> =>
  dataSource.manager.getRepository(PurchaseDraftLineEntity).findOneBy({ id });

const readRejections = (
  purchaseDraftLineId: string,
): Promise<PurchaseDraftLineRejectionEntity[]> =>
  dataSource.manager.getRepository(PurchaseDraftLineRejectionEntity).find({
    where: { purchaseDraftLineId },
    order: { rejectionReasonId: 'ASC' },
  });

const lockLineInTransaction = (
  purchaseDraftId: string,
  purchaseDraftLineId: string,
  warehouseId: string,
): Promise<LockPurchaseDraftLineForEndingResult> =>
  transactions.executeInTransaction({}, () =>
    repository.lockDraftLineForEnding(
      purchaseDraftId,
      purchaseDraftLineId,
      warehouseId,
    ),
  );

const recordEndingInTransaction = (
  input: RecordLineEndingInput,
): Promise<RecordLineEndingResult> =>
  transactions.executeInTransaction({}, () =>
    repository.recordLineEnding(input),
  );

// Captures the SQL PostgreSQL was actually asked to run, the same idiom
// `CustomerAddressBookRepository`'s integration spec uses for `lockDeliveryAddresses`. PGlite has a
// single backend, so a genuine two-connection race either self-deadlocks or lets both writers win
// (vitest.pglite.config.ts, data-model.md § "Concurrency, locks and transactions": "PGlite cannot
// prove any of this … the lock order and the conditional-update races are asserted by *shape*").
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

// The columns a statement actually asks PostgreSQL for, read from its select list alone. Cutting at
// `FROM` is what keeps a column named only in the `WHERE` clause — `purchase_draft_id`,
// `warehouse_id` — out of the answer: the composite tuple the line is *resolved* by is not the
// projection the caller is handed.
const selectedColumnsOf = (statement: string): string[] => {
  const selectList = /^SELECT\s+(?<list>[\S\s]*?)\s+FROM\s/u.exec(statement)
    ?.groups?.list;

  return [...(selectList ?? '').matchAll(/"[^"]+"\.(?:"(?<column>[^"]+)")/gu)]
    .map((match) => match.groups?.column ?? '')
    .sort();
};

const lineProjectionOf = (statements: string[]): string[] =>
  selectedColumnsOf(
    statements.find((sql) => /FROM\s+"purchase_draft_lines"/u.test(sql)) ?? '',
  );

const conditionOf = (
  rejections: RecordLineEndingConditionInput['rejections'],
  preReceiptConformance: RecordLineEndingConditionInput['preReceiptConformance'] = null,
  preReceiptConformanceNote: string | null = null,
): RecordLineEndingConditionInput => ({
  preReceiptConformance,
  preReceiptConformanceNote,
  rejections,
});

// eslint-disable-next-line max-lines-per-function -- a repository integration suite covering both write methods across their success and refusal terms is inherently long
describe('ArrivalConfirmationRepository', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE purchase_draft_line_rejections, arrival_allocations, purchase_draft_demand_snapshots, purchase_draft_line_links, purchase_draft_lines, purchase_drafts, item_stock_adjustments, customer_orders, items, warehouse_memberships, roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('lockDraftLineForEnding', () => {
    it('reads the draft header and the one named line, scoped to the Warehouse', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const lineId = await seedLine(seeded, draftId, 150);

      const locked = await lockLineInTransaction(
        draftId,
        lineId,
        seeded.warehouseId,
      );

      expect(locked.draft).toMatchObject({
        id: draftId,
        warehouseId: seeded.warehouseId,
        state: 'ready_for_ordering',
      });
      expect(locked.line).toMatchObject({
        id: lineId,
        deliveryMode: 'via_warehouse',
        endingKind: null,
        endingRecordedByUserId: null,
        endingRecordedAt: null,
      });
    });

    // AC-20a — the pre-read is what lets a caller name when and by whom an existing ending was
    // recorded, which only a read of the four attribution columns together can answer.
    it('reads the existing attribution of a line whose ending is already recorded', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const lineId = await seedLine(seeded, draftId, 100, {
        endingKind: 'arrival',
        endingQuantity: 90,
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: now,
      });

      const locked = await lockLineInTransaction(
        draftId,
        lineId,
        seeded.warehouseId,
      );

      expect(locked.line).toMatchObject({
        endingKind: 'arrival',
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: now,
      });
    });

    // AC-15/spec.md §6.1 "Allocation as a back door onto a frozen record" — a line of another draft
    // or another Warehouse resolves to `null` exactly as a missing one does, on the composite tuple
    // rather than by identifier alone, so the caller's single refusal cannot disclose that it exists
    // elsewhere.
    it('resolves no line for a draft of another Warehouse', async () => {
      const seeded = await seedWarehouse();
      const elsewhere = await seedWarehouse();
      const foreignDraftId = await seedDraft(elsewhere, 'ready_for_ordering');
      const foreignLineId = await seedLine(elsewhere, foreignDraftId);

      const locked = await lockLineInTransaction(
        foreignDraftId,
        foreignLineId,
        seeded.warehouseId,
      );

      expect(locked.draft).toBeNull();
      expect(locked.line).toBeNull();
    });

    it('resolves no line that belongs to a different draft of the same Warehouse', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const otherDraftId = await seedDraft(seeded, 'ready_for_ordering');
      const otherDraftLineId = await seedLine(seeded, otherDraftId);

      const locked = await lockLineInTransaction(
        draftId,
        otherDraftLineId,
        seeded.warehouseId,
      );

      expect(locked.draft).toMatchObject({ id: draftId });
      expect(locked.line).toBeNull();
    });

    // T18/sad.md §6.10 step 2 — "resolves the draft in `ready_for_ordering` under lock, then the
    // named line". Two members ending the last two lines of one draft concurrently would otherwise
    // each evaluate `recordLineEnding`'s `NOT EXISTS` closure predicate against a snapshot in which
    // the other line is still un-ended, so neither closure statement affects the draft row — the
    // draft never reaches Closed even though every line now carries an ending. Taking `FOR UPDATE`
    // on the `purchase_drafts` row here, before the line is resolved, is what serialises the two
    // closures. PGlite is single-backend (see `captureStatements` above), so the proof is statement
    // shape: the first statement this method issues names `purchase_drafts` and carries `FOR
    // UPDATE`.
    it('takes the row lock the draft closure is decided under, before resolving the line', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const lineId = await seedLine(seeded, draftId, 100);

      const { statements } = await captureStatements(() =>
        lockLineInTransaction(draftId, lineId, seeded.warehouseId),
      );

      expect(statements[0]).toMatch(/FOR UPDATE/u);
      expect(statements[0]).toMatch(/"purchase_drafts"/u);
    });

    // AC-17/AC-17a/sad.md §6.1 step 3 — the Pre-receipt Conformance is decided against the
    // Packaging Type and Value-adding Note **frozen on the line**, so both must be readable from the
    // row the ending already locks and from nothing else. This is the whole widening: the projection
    // gains these two and nothing more.
    it('projects the Packaging Type and Value-adding Note the line was frozen with', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const lineId = await seedLine(seeded, draftId, 150, {
        packagingTypeId: 'cartons',
        valueAddingNote: 'Label each coil with its length',
      });

      const locked = await lockLineInTransaction(
        draftId,
        lineId,
        seeded.warehouseId,
      );

      expect(locked.line).toMatchObject({
        id: lineId,
        packagingTypeId: 'cartons',
        valueAddingNote: 'Label each coil with its length',
      });
    });

    // data-model.md § "Repository boundaries" — "gains `packaging_type_id` and `value_adding_note`
    // and **nothing else**". Asserted as the whole projected column list rather than as two
    // `toContain`s, because "nothing else" is the half that rots silently: a third column added for
    // some later convenience passes every positive assertion in this file.
    it('asks the store for exactly the ending columns and the two frozen ones', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const lineId = await seedLine(seeded, draftId, 150, {
        packagingTypeId: 'cartons',
        valueAddingNote: 'Label each coil with its length',
      });

      const { statements } = await captureStatements(() =>
        lockLineInTransaction(draftId, lineId, seeded.warehouseId),
      );

      expect(lineProjectionOf(statements)).toEqual([
        'delivery_mode',
        'ending_kind',
        'ending_recorded_at',
        'ending_recorded_by_user_id',
        'id',
        'packaging_type_id',
        'value_adding_note',
      ]);
    });

    // **Hard rule** (sad.md §11, spec.md §6.1, task T5) — `ordered_quantity` stays withheld. It is
    // what keeps "Refusal as a route around the Allocation bound" a *property* of the write path
    // rather than a check on it: AC-19 bounds the ending quantity neither above nor below the
    // ordered figure, so a caller that could read it could derive a bound this operation does not
    // have. A negative guarantee nothing else in this file pins — T14 adds the architecture check,
    // this pins the behaviour.
    it('withholds the ordered quantity from the locked line and from the statement that reads it', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const lineId = await seedLine(seeded, draftId, 150, {
        packagingTypeId: 'cartons',
        valueAddingNote: 'Label each coil with its length',
      });

      const { result, statements } = await captureStatements(() =>
        lockLineInTransaction(draftId, lineId, seeded.warehouseId),
      );

      expect(lineProjectionOf(statements)).not.toContain('ordered_quantity');
      expect(result.line).not.toHaveProperty('orderedQuantity');
    });
  });

  // eslint-disable-next-line max-lines-per-function -- one write method covering the ending, its conformance and its refusals across their success and refusal terms is inherently long
  describe('recordLineEnding', () => {
    // AC-19 — one line's ending is written with its acting member and the time, and the draft stays
    // in Ready for Ordering while another line of it is still without one.
    it('writes the ending and leaves the draft in Ready for Ordering while another line has none', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const endingLineId = await seedLine(seeded, draftId, 150);
      await seedLine(seeded, draftId, 40);

      const written = await recordEndingInTransaction({
        purchaseDraftId: draftId,
        purchaseDraftLineId: endingLineId,
        warehouseId: seeded.warehouseId,
        endingQuantity: 140,
        endingKind: 'arrival',
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: later,
        condition: null,
      });

      expect(written).toEqual({ recorded: true, closed: false });
      expect(await readLine(endingLineId)).toMatchObject({
        endingQuantity: 140,
        endingKind: 'arrival',
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: later,
      });
      expect(await readDraft(draftId)).toMatchObject({
        state: 'ready_for_ordering',
      });
    });

    // AC-19/sad.md §6.10 step 5 — the ending of the draft's **last** unrecorded line moves it to
    // Closed in the same transaction, predicated on `NOT EXISTS (… ending_recorded_at IS NULL)`
    // rather than on a separate read-then-write.
    it('closes the draft in the same write as the ending of its last unrecorded line', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const firstLineId = await seedLine(seeded, draftId, 100);
      const lastLineId = await seedLine(seeded, draftId, 40);

      await recordEndingInTransaction({
        purchaseDraftId: draftId,
        purchaseDraftLineId: firstLineId,
        warehouseId: seeded.warehouseId,
        endingQuantity: 100,
        endingKind: 'arrival',
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: later,
        condition: null,
      });

      const written = await recordEndingInTransaction({
        purchaseDraftId: draftId,
        purchaseDraftLineId: lastLineId,
        warehouseId: seeded.warehouseId,
        endingQuantity: 40,
        endingKind: 'arrival',
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: evenLater,
        condition: null,
      });

      expect(written).toEqual({ recorded: true, closed: true });
      expect(await readDraft(draftId)).toMatchObject({
        state: 'closed',
        closedByUserId: seeded.userId,
        closedAt: evenLater,
        closureReason: null,
      });
    });

    // AC-20a — the write is predicated on `ending_recorded_at IS NULL`, so a second ending on an
    // already-ended line affects zero rows and neither the line nor the draft changes.
    it('writes nothing against a line whose ending is already recorded', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const lineId = await seedLine(seeded, draftId, 100, {
        endingKind: 'arrival',
        endingQuantity: 90,
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: now,
      });
      const before = await readLine(lineId);

      const written = await recordEndingInTransaction({
        purchaseDraftId: draftId,
        purchaseDraftLineId: lineId,
        warehouseId: seeded.warehouseId,
        endingQuantity: 100,
        endingKind: 'arrival',
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: later,
        condition: null,
      });

      expect(written).toEqual({ recorded: false, closed: false });
      expect(await readLine(lineId)).toEqual(before);
      expect(await readDraft(draftId)).toMatchObject({
        state: 'ready_for_ordering',
      });
    });

    // AC-15/spec.md §6.1 — the second, independent bound on which row an ending may reach: the
    // composite tuple `uq_purchase_draft_lines_id_draft_warehouse`, never the identifier alone.
    it('writes no ending to a line of another draft or another Warehouse', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      await seedLine(seeded, draftId, 100);

      const otherDraftId = await seedDraft(seeded, 'ready_for_ordering');
      const otherDraftLineId = await seedLine(seeded, otherDraftId, 100);

      const elsewhere = await seedWarehouse();
      const foreignDraftId = await seedDraft(elsewhere, 'ready_for_ordering');
      const foreignLineId = await seedLine(elsewhere, foreignDraftId, 100);

      const written = await recordEndingInTransaction({
        purchaseDraftId: draftId,
        purchaseDraftLineId: otherDraftLineId,
        warehouseId: seeded.warehouseId,
        endingQuantity: 999,
        endingKind: 'arrival',
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: later,
        condition: null,
      });

      expect(written).toEqual({ recorded: false, closed: false });
      expect(await readLine(otherDraftLineId)).toMatchObject({
        endingRecordedAt: null,
      });

      const writtenForeign = await recordEndingInTransaction({
        purchaseDraftId: foreignDraftId,
        purchaseDraftLineId: foreignLineId,
        warehouseId: seeded.warehouseId,
        endingQuantity: 999,
        endingKind: 'arrival',
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: later,
        condition: null,
      });

      expect(writtenForeign).toEqual({ recorded: false, closed: false });
      expect(await readLine(foreignLineId)).toMatchObject({
        endingRecordedAt: null,
      });
    });

    // sad.md §6.10 step 5 — the closure is guarded on `state = 'ready_for_ordering'` too, so a draft
    // that no longer resolves there (already Closed with a reason, or discarded) never closes a
    // second time even when every line of it now carries an ending.
    describe.each<[PurchaseDraftEntity['state'], string]>([
      ['closed', 'already Closed'],
      ['discarded', 'already discarded'],
    ])('against a draft %s (%s)', (state) => {
      it('writes the ending but does not close the draft again', async () => {
        const seeded = await seedWarehouse();
        const draftId = await seedDraft(seeded, state);
        const lineId = await seedLine(seeded, draftId, 100);
        const before = await readDraft(draftId);

        const written = await recordEndingInTransaction({
          purchaseDraftId: draftId,
          purchaseDraftLineId: lineId,
          warehouseId: seeded.warehouseId,
          endingQuantity: 100,
          endingKind: 'arrival',
          endingRecordedByUserId: seeded.userId,
          endingRecordedAt: later,
          condition: null,
        });

        expect(written).toEqual({ recorded: true, closed: false });
        expect(await readDraft(draftId)).toEqual(before);
      });
    });

    // AC-01/AC-08/AC-15/sad.md §6.1 step 8 — one hundred presented, five refused as damaged by
    // packing and three as packaging not as instructed, judged against the frozen instruction, all
    // in the one statement set the ending already had. The Rejection carries the line's Warehouse
    // and Delivery Mode because `fk_purchase_draft_line_rejections_line` proves all three through
    // one reference (AC-25, AC-26); it names its Reason rather than copying its wording (AC-23a);
    // and it starts Undecided with the raising member and the time (AC-19, spec.md §6.1).
    it('writes the ending, its conformance and one row per stated Reason', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const lineId = await seedLine(seeded, draftId, 100, {
        packagingTypeId: 'cartons',
        valueAddingNote: 'Label each coil with its length',
      });

      const written = await recordEndingInTransaction({
        purchaseDraftId: draftId,
        purchaseDraftLineId: lineId,
        warehouseId: seeded.warehouseId,
        endingQuantity: 100,
        endingKind: 'arrival',
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: later,
        condition: conditionOf(
          [
            {
              rejectionReasonId: 'damaged_by_packing',
              quantity: 5,
              source: 'inspected',
              description: 'Cartons crushed on the top layer',
            },
            {
              rejectionReasonId: 'packaging_not_as_instructed',
              quantity: 3,
              source: 'inspected',
              description: null,
            },
          ],
          'not_met',
          'Coils arrived unlabelled and two cartons were the wrong type',
        ),
      });

      expect(written).toEqual({ recorded: true, closed: true });
      expect(await readLine(lineId)).toMatchObject({
        endingQuantity: 100,
        endingRecordedAt: later,
        preReceiptConformance: 'not_met',
        preReceiptConformanceNote:
          'Coils arrived unlabelled and two cartons were the wrong type',
      });

      const rejections = await readRejections(lineId);

      expect(rejections).toHaveLength(2);
      expect(rejections[0]).toMatchObject({
        purchaseDraftLineId: lineId,
        warehouseId: seeded.warehouseId,
        deliveryMode: 'via_warehouse',
        rejectionReasonId: 'damaged_by_packing',
        quantity: 5,
        source: 'inspected',
        description: 'Cartons crushed on the top layer',
        disposition: 'undecided',
        raisedByUserId: seeded.userId,
        createdAt: later,
        amendedByUserId: null,
        amendedAt: null,
      });
      expect(rejections[1]).toMatchObject({
        rejectionReasonId: 'packaging_not_as_instructed',
        quantity: 3,
        source: 'inspected',
        description: null,
        disposition: 'undecided',
      });
    });

    // data-model.md § "Concurrency, locks and transactions" / sad.md §8 — the lock order is
    // `delivery-addresses`', **extended** rather than replaced: the draft row (taken in
    // `lockDraftLineForEnding`), then its line, then that line's refusals, then the Customer Orders.
    // A fourth write path adopting a different order reintroduces the deadlock, so the position of
    // the refusal rows between the line and the closure is asserted, not assumed.
    it('writes the refusals between the line and the draft closure, in the fixed lock order', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const lineId = await seedLine(seeded, draftId, 100);

      const { statements } = await captureStatements(() =>
        recordEndingInTransaction({
          purchaseDraftId: draftId,
          purchaseDraftLineId: lineId,
          warehouseId: seeded.warehouseId,
          endingQuantity: 100,
          endingKind: 'arrival',
          endingRecordedByUserId: seeded.userId,
          endingRecordedAt: later,
          condition: conditionOf([
            {
              rejectionReasonId: 'damaged_in_transit',
              quantity: 4,
              source: 'inspected',
              description: null,
            },
          ]),
        }),
      );

      const lineWrite = statements.findIndex((sql) =>
        /UPDATE\s+"purchase_draft_lines"/u.test(sql),
      );
      const refusalWrite = statements.findIndex((sql) =>
        /INSERT INTO\s+"purchase_draft_line_rejections"/u.test(sql),
      );
      const closure = statements.findIndex((sql) =>
        /UPDATE\s+"purchase_drafts"/u.test(sql),
      );

      expect(lineWrite).toBeGreaterThanOrEqual(0);
      expect(refusalWrite).toBeGreaterThan(lineWrite);
      expect(closure).toBeGreaterThan(refusalWrite);
    });

    // AC-01/AC-08/spec.md §6 "Ending atomicity" — "a failure anywhere rolled the whole submission
    // back, its refusals included". The failure is forced *after* the ending row is written, by a
    // Rejection naming a Reason outside the catalogue: `fk_purchase_draft_line_rejections_reason`
    // refuses it, and what must survive the rollback is **nothing** — not the ending, not the
    // conformance, not the other refusal that was accepted before it.
    it('leaves no ending, no conformance and no Rejection when a refusal fails mid-write', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const lineId = await seedLine(seeded, draftId, 100, {
        packagingTypeId: 'cartons',
      });

      await expect(
        recordEndingInTransaction({
          purchaseDraftId: draftId,
          purchaseDraftLineId: lineId,
          warehouseId: seeded.warehouseId,
          endingQuantity: 100,
          endingKind: 'arrival',
          endingRecordedByUserId: seeded.userId,
          endingRecordedAt: later,
          condition: conditionOf(
            [
              {
                rejectionReasonId: 'damaged_in_transit',
                quantity: 5,
                source: 'inspected',
                description: null,
              },
              {
                rejectionReasonId: 'reason_outside_the_catalogue',
                quantity: 3,
                source: 'inspected',
                description: null,
              },
            ],
            'not_met',
            'Half the cartons were soaked',
          ),
        }),
      ).rejects.toThrow();

      expect(await readLine(lineId)).toMatchObject({
        endingQuantity: null,
        endingKind: null,
        endingRecordedByUserId: null,
        endingRecordedAt: null,
        preReceiptConformance: null,
        preReceiptConformanceNote: null,
      });
      expect(await readRejections(lineId)).toEqual([]);
      expect(await readDraft(draftId)).toMatchObject({
        state: 'ready_for_ordering',
      });
    });

    // AC-04a — a line where the supplier delivered nothing at all records its ending and neither
    // judgement. `chk_purchase_draft_lines_conformance_requires_ending` is the store's half of the
    // same rule; this is the repository's.
    it('writes neither a conformance nor a Rejection for a nothing-received ending', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const lineId = await seedLine(seeded, draftId, 100, {
        packagingTypeId: 'cartons',
      });

      const written = await recordEndingInTransaction({
        purchaseDraftId: draftId,
        purchaseDraftLineId: lineId,
        warehouseId: seeded.warehouseId,
        endingQuantity: 0,
        endingKind: 'arrival',
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: later,
        condition: null,
      });

      expect(written).toEqual({ recorded: true, closed: true });
      expect(await readLine(lineId)).toMatchObject({
        endingQuantity: 0,
        endingRecordedAt: later,
        preReceiptConformance: null,
        preReceiptConformanceNote: null,
      });
      expect(await readRejections(lineId)).toEqual([]);
    });

    // AC-04 — the ending is predicated on `ending_recorded_at IS NULL`, and the refusals belong to
    // that same predicate. A second submission against an already-ended line must add no Rejection
    // either: an insert that ran regardless of the guard would be exactly the "further refusal
    // against a recorded ending" AC-04 forbids, reachable without touching the line at all.
    it('writes no Rejection against a line whose ending is already recorded', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const lineId = await seedLine(seeded, draftId, 100, {
        endingKind: 'arrival',
        endingQuantity: 90,
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: now,
      });

      const written = await recordEndingInTransaction({
        purchaseDraftId: draftId,
        purchaseDraftLineId: lineId,
        warehouseId: seeded.warehouseId,
        endingQuantity: 100,
        endingKind: 'arrival',
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: later,
        condition: conditionOf([
          {
            rejectionReasonId: 'damaged_in_transit',
            quantity: 8,
            source: 'inspected',
            description: null,
          },
        ]),
      });

      expect(written).toEqual({ recorded: false, closed: false });
      expect(await readRejections(lineId)).toEqual([]);
    });

    // AC-17/AC-17a — the verdict is decided against the instruction frozen on the line, and the
    // store is the final arbiter of it
    // (`chk_purchase_draft_lines_pre_receipt_conformance_instruction`). A zero-quantity ending
    // refuses **every** verdict, Not applicable included
    // (`chk_purchase_draft_lines_conformance_requires_ending`), which is why a nothing-received
    // ending must leave both columns NULL rather than record that the judgement does not apply.
    describe.each<
      [string, SeedLineOverrides, number, RecordLineEndingConditionInput]
    >([
      [
        'not-applicable on a line frozen carrying an instruction (AC-17a)',
        { packagingTypeId: 'cartons' },
        100,
        conditionOf([], 'not_applicable'),
      ],
      [
        'a judgement on a line frozen carrying no instruction (AC-17)',
        {},
        100,
        conditionOf([], 'met'),
      ],
      [
        'any verdict beside a nothing-received ending (AC-04a)',
        {},
        0,
        conditionOf([], 'not_applicable'),
      ],
    ])('refusing %s', (_case, overrides, endingQuantity, condition) => {
      it('records no part of the ending', async () => {
        const seeded = await seedWarehouse();
        const draftId = await seedDraft(seeded, 'ready_for_ordering');
        const lineId = await seedLine(seeded, draftId, 100, overrides);

        await expect(
          recordEndingInTransaction({
            purchaseDraftId: draftId,
            purchaseDraftLineId: lineId,
            warehouseId: seeded.warehouseId,
            endingQuantity,
            endingKind: 'arrival',
            endingRecordedByUserId: seeded.userId,
            endingRecordedAt: later,
            condition,
          }),
        ).rejects.toThrow();

        expect(await readLine(lineId)).toMatchObject({
          endingRecordedAt: null,
          preReceiptConformance: null,
        });
        expect(await readDraft(draftId)).toMatchObject({
          state: 'ready_for_ordering',
        });
      });
    });
  });
});
