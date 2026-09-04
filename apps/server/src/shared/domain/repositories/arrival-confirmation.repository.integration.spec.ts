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
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import {
  ArrivalConfirmationRepository,
  type LockPurchaseDraftLineForEndingResult,
  type RecordLineEndingInput,
  type RecordLineEndingResult,
} from 'shared/domain/repositories/arrival-confirmation.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';

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
    packagingTypeId: null,
    valueAddingNote: null,
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

// eslint-disable-next-line max-lines-per-function -- a repository integration suite covering both write methods across their success and refusal terms is inherently long
describe('ArrivalConfirmationRepository', () => {
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
  });

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
      });

      const written = await recordEndingInTransaction({
        purchaseDraftId: draftId,
        purchaseDraftLineId: lastLineId,
        warehouseId: seeded.warehouseId,
        endingQuantity: 40,
        endingKind: 'arrival',
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: evenLater,
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
        });

        expect(written).toEqual({ recorded: true, closed: false });
        expect(await readDraft(draftId)).toEqual(before);
      });
    });
  });
});
