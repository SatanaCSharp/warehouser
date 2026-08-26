import { randomUUID } from 'node:crypto';

// T15 — `ArrivalConfirmationRepository` does not exist yet. data-model.md "Repository boundaries"
// names it explicitly, alongside `PurchaseDraftFreezeRepository` and `DemandAllocationRepository`.
// This is the RED for the Purchase Draft half of Arrival Confirmation (sad.md §6.9/§8): reading the
// draft row and then its lines in the ascending order the fixed lock order names ("the draft row,
// then its lines, then the Customer Orders it touches in ascending identifier order", data-model.md
// "Concurrency, locks and transactions" — no explicit row lock is taken here, despite the method
// name) — and writing every line's received quantity together with
// the guarded move to Closed, so a second confirmation of one draft affects zero rows exactly as
// `PurchaseDraftFreezeRepository.freeze`/`.close` do for their own transitions (T13's proven
// idiom). The genuinely concurrent race reuses the two-`QueryRunner`, `pg_stat_activity`-poll
// technique `purchase-draft-freeze.repository.integration.spec.ts` (T13) established.
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
// The shape this RED step expects the implementer to expose (tasks/arrival-confirmation.md "What";
// data-model.md "purchase_draft_lines.received_quantity", "purchase_drafts.arrival_confirmed_*").
import { ArrivalConfirmationRepository } from 'shared/domain/repositories/arrival-confirmation.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
import type { QueryRunner } from 'typeorm';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-26T10:00:00.000Z');
const later = new Date('2026-08-26T12:00:00.000Z');

interface ReceivedQuantityInput {
  readonly purchaseDraftLineId: string;
  readonly receivedQuantity: number;
}

interface ConfirmArrivalInput {
  readonly purchaseDraftId: string;
  readonly warehouseId: string;
  readonly receivedQuantities: readonly ReceivedQuantityInput[];
  readonly arrivalConfirmedByUserId: string;
  readonly arrivalConfirmedAt: Date;
}

interface LockedPurchaseDraftForArrival {
  readonly id: string;
  readonly warehouseId: string;
  readonly state: string;
}

// AC-15/spec.md §6.1 — the identifier and nothing else. The lines are read because the fixed lock
// order names them (sad.md §8) and because the caller needs to know which lines the confirmation
// may write, not to read a frozen field off them.
interface LockedPurchaseDraftLineForArrival {
  readonly id: string;
}

interface LockPurchaseDraftForArrivalResult {
  readonly draft: LockedPurchaseDraftForArrival | null;
  readonly lines: readonly LockedPurchaseDraftLineForArrival[];
}

interface ArrivalConfirmationRepositoryContract {
  lockDraftForArrival(
    purchaseDraftId: string,
    warehouseId: string,
  ): Promise<LockPurchaseDraftForArrivalResult>;
  confirmArrival(input: ConfirmArrivalInput): Promise<boolean>;
}

const repository = new ArrivalConfirmationRepository(
  dataSource,
) as unknown as ArrivalConfirmationRepositoryContract;

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
    arrivalConfirmedByUserId: state === 'closed' ? seeded.userId : null,
    arrivalConfirmedAt: state === 'closed' ? now : null,
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

const seedLine = async (
  seeded: Seeded,
  draftId: string,
  orderedQuantity = 100,
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
    receivedQuantity: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

const readDraft = (id: string): Promise<PurchaseDraftEntity | null> =>
  dataSource.manager.getRepository(PurchaseDraftEntityClass).findOneBy({ id });

const readLine = (id: string): Promise<PurchaseDraftLineEntity | null> =>
  dataSource.manager.getRepository(PurchaseDraftLineEntity).findOneBy({ id });

const lockInTransaction = (
  purchaseDraftId: string,
  warehouseId: string,
): Promise<LockPurchaseDraftForArrivalResult> =>
  transactions.executeInTransaction({}, () =>
    repository.lockDraftForArrival(purchaseDraftId, warehouseId),
  );

const confirmInTransaction = (input: ConfirmArrivalInput): Promise<boolean> =>
  transactions.executeInTransaction({}, () => repository.confirmArrival(input));

// eslint-disable-next-line max-lines-per-function -- integration suite setup is inherently long
describeIntegration('ArrivalConfirmationRepository', () => {
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

  describe('lockDraftForArrival', () => {
    it('reads the draft header and every one of its lines, scoped to the Warehouse', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const lineOneId = await seedLine(seeded, draftId, 150);
      const lineTwoId = await seedLine(seeded, draftId, 40);

      const locked = await lockInTransaction(draftId, seeded.warehouseId);

      expect(locked.draft).toMatchObject({
        id: draftId,
        warehouseId: seeded.warehouseId,
        state: 'ready_for_ordering',
      });
      expect(locked.lines.map((line) => line.id).sort()).toEqual(
        [lineOneId, lineTwoId].sort(),
      );
    });

    // AC-03/AC-11 — a draft of another Warehouse, or one that does not exist, resolves to nothing
    // on the same non-enumerating terms every other locking read in this feature already follows.
    it('resolves nothing for a draft of another Warehouse', async () => {
      const seeded = await seedWarehouse();
      const elsewhere = await seedWarehouse();
      const foreignDraftId = await seedDraft(elsewhere, 'ready_for_ordering');
      await seedLine(elsewhere, foreignDraftId);

      const locked = await lockInTransaction(
        foreignDraftId,
        seeded.warehouseId,
      );

      expect(locked.draft).toBeNull();
      expect(locked.lines).toEqual([]);
    });
  });

  describe('confirmArrival', () => {
    // AC-17/AC-17b — every line's received quantity and the move to Closed land as one persistence
    // operation; `received_quantity` is unbounded above and below by `ordered_quantity`.
    it('writes every received quantity and moves a Ready for Ordering draft to Closed together', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const shortLineId = await seedLine(seeded, draftId, 150);
      const overLineId = await seedLine(seeded, draftId, 40);

      const confirmed = await confirmInTransaction({
        purchaseDraftId: draftId,
        warehouseId: seeded.warehouseId,
        receivedQuantities: [
          { purchaseDraftLineId: shortLineId, receivedQuantity: 100 },
          { purchaseDraftLineId: overLineId, receivedQuantity: 55 },
        ],
        arrivalConfirmedByUserId: seeded.userId,
        arrivalConfirmedAt: later,
      });

      expect(confirmed).toBe(true);
      expect(await readLine(shortLineId)).toMatchObject({
        receivedQuantity: 100,
      });
      expect(await readLine(overLineId)).toMatchObject({
        receivedQuantity: 55,
      });
      expect(await readDraft(draftId)).toMatchObject({
        state: 'closed',
        arrivalConfirmedByUserId: seeded.userId,
        arrivalConfirmedAt: later,
      });
    });

    // AC-15/spec.md §6.1 — the guarded header write is bound to the acting Warehouse as well as to
    // the state, matching the line writes. The service's pre-read already resolves the draft within
    // the Warehouse, so this is the second bound rather than the first; asserting it here is what
    // stops the header write being the one single-bound statement left on this path.
    it('moves no draft of another Warehouse to Closed', async () => {
      const seeded = await seedWarehouse();
      const elsewhere = await seedWarehouse();
      const foreignDraftId = await seedDraft(elsewhere, 'ready_for_ordering');
      const foreignLineId = await seedLine(elsewhere, foreignDraftId, 100);

      const confirmed = await confirmInTransaction({
        purchaseDraftId: foreignDraftId,
        warehouseId: seeded.warehouseId,
        receivedQuantities: [
          { purchaseDraftLineId: foreignLineId, receivedQuantity: 100 },
        ],
        arrivalConfirmedByUserId: seeded.userId,
        arrivalConfirmedAt: later,
      });

      expect(confirmed).toBe(false);
      expect(await readDraft(foreignDraftId)).toMatchObject({
        state: 'ready_for_ordering',
        arrivalConfirmedByUserId: null,
      });
      expect(await readLine(foreignLineId)).toMatchObject({
        receivedQuantity: null,
      });
    });

    // AC-15/spec.md §6.1 — the second, independent bound on which rows a confirmation may reach.
    // The service checks the submitted identifiers against the lines it read; this asserts the
    // repository refuses to widen that on its own, writing each received quantity through the
    // composite tuple `uq_purchase_draft_lines_id_draft_warehouse` indexes rather than by
    // identifier alone. Exercised here because the service guard short-circuits it in the
    // end-to-end path, so nothing else can observe this predicate.
    it('writes no received quantity to a line of another draft or another Warehouse', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const ownLineId = await seedLine(seeded, draftId, 100);

      const otherDraftId = await seedDraft(seeded, 'ready_for_ordering');
      const otherDraftLineId = await seedLine(seeded, otherDraftId, 100);

      const elsewhere = await seedWarehouse();
      const foreignDraftId = await seedDraft(elsewhere, 'ready_for_ordering');
      const foreignLineId = await seedLine(elsewhere, foreignDraftId, 100);

      const confirmed = await confirmInTransaction({
        purchaseDraftId: draftId,
        warehouseId: seeded.warehouseId,
        receivedQuantities: [
          { purchaseDraftLineId: ownLineId, receivedQuantity: 100 },
          { purchaseDraftLineId: otherDraftLineId, receivedQuantity: 999 },
          { purchaseDraftLineId: foreignLineId, receivedQuantity: 999 },
        ],
        arrivalConfirmedByUserId: seeded.userId,
        arrivalConfirmedAt: later,
      });

      expect(confirmed).toBe(true);
      expect(await readLine(ownLineId)).toMatchObject({
        receivedQuantity: 100,
      });
      // Neither foreign line was reached, in either direction.
      expect(await readLine(otherDraftLineId)).toMatchObject({
        receivedQuantity: null,
      });
      expect(await readLine(foreignLineId)).toMatchObject({
        receivedQuantity: null,
      });
    });

    // AC-17b/sad.md §8 — confirming an arrival closes a draft once and for all: a draft that no
    // longer resolves in Ready for Ordering (already Closed by an arrival, closed with a reason, or
    // discarded) affects zero rows and writes no received quantity at all.
    describe.each<[PurchaseDraftEntity['state'], string]>([
      ['closed', 'already Closed'],
      ['discarded', 'already discarded'],
    ])('against a draft %s (%s)', (state) => {
      it('affects zero rows and writes no received quantity', async () => {
        const seeded = await seedWarehouse();
        const draftId = await seedDraft(seeded, state);
        const lineId = await seedLine(seeded, draftId);
        const before = await readDraft(draftId);

        const confirmed = await confirmInTransaction({
          purchaseDraftId: draftId,
          warehouseId: seeded.warehouseId,
          receivedQuantities: [
            { purchaseDraftLineId: lineId, receivedQuantity: 10 },
          ],
          arrivalConfirmedByUserId: seeded.userId,
          arrivalConfirmedAt: later,
        });

        expect(confirmed).toBe(false);
        expect(await readDraft(draftId)).toEqual(before);
        expect(await readLine(lineId)).toMatchObject({
          receivedQuantity: null,
        });
      });
    });

    // sad.md §8 — two genuinely concurrent confirmations of one draft leave exactly one
    // succeeding. The second writer's guarded `UPDATE … WHERE state = 'ready_for_ordering'` blocks
    // on the row the first writer's still-uncommitted transaction holds, then re-evaluates its own
    // `WHERE` clause once unblocked and finds the state already moved on — the same guarantee
    // `purchase-draft-freeze.repository.integration.spec.ts` (T13) proves for the freeze race,
    // applied here to the arrival race.
    it('lets exactly one of two concurrent confirmations succeed, the second affecting no row', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const lineId = await seedLine(seeded, draftId, 100);

      const runner1 = dataSource.createQueryRunner();
      await runner1.connect();
      const runner2 = dataSource.createQueryRunner();
      await runner2.connect();
      await runner1.startTransaction();
      await runner2.startTransaction();

      const backendPid = async (runner: QueryRunner): Promise<number> => {
        const rows = await runner.query('SELECT pg_backend_pid() AS pid');
        return Number(rows[0].pid);
      };

      const blockedOnQueryContaining = async (
        pid: number,
        expectedQueryFragment: string,
      ): Promise<boolean> => {
        const rows = await dataSource.query(
          `SELECT query, wait_event_type
             FROM pg_stat_activity
            WHERE pid = $1`,
          [pid],
        );
        const activity = rows[0] as
          { query: string; wait_event_type: string | null } | undefined;
        return (
          activity?.wait_event_type === 'Lock' &&
          (activity.query ?? '').includes(expectedQueryFragment)
        );
      };

      const waitForBlockedOn = async (
        pid: number,
        expectedQueryFragment: string,
      ): Promise<void> => {
        for (let attempt = 0; attempt < 200; attempt += 1) {
          if (await blockedOnQueryContaining(pid, expectedQueryFragment)) {
            return;
          }
          if (attempt === 199) {
            throw new Error(
              `Backend ${pid} never blocked on a query containing "${expectedQueryFragment}" within the poll budget`,
            );
          }

          await new Promise((resolve) => setTimeout(resolve, 15));
        }
      };

      const pid2 = await backendPid(runner2);

      const confirmed1 = await context.run(runner1.manager, () =>
        repository.confirmArrival({
          purchaseDraftId: draftId,
          warehouseId: seeded.warehouseId,
          receivedQuantities: [
            { purchaseDraftLineId: lineId, receivedQuantity: 100 },
          ],
          arrivalConfirmedByUserId: seeded.userId,
          arrivalConfirmedAt: now,
        }),
      );
      expect(confirmed1).toBe(true);

      const txn2Result = context.run(runner2.manager, () =>
        repository.confirmArrival({
          purchaseDraftId: draftId,
          warehouseId: seeded.warehouseId,
          receivedQuantities: [
            { purchaseDraftLineId: lineId, receivedQuantity: 999 },
          ],
          arrivalConfirmedByUserId: seeded.userId,
          arrivalConfirmedAt: later,
        }),
      );
      txn2Result.catch(() => undefined);

      await waitForBlockedOn(pid2, 'UPDATE "purchase_drafts"');

      await runner1.commitTransaction();
      await runner1.release();

      const confirmed2 = await txn2Result;
      expect(confirmed2).toBe(false);
      await runner2.commitTransaction();
      await runner2.release();

      // The loser's received quantity never lands — the winner's does.
      expect(await readLine(lineId)).toMatchObject({ receivedQuantity: 100 });
      expect(await readDraft(draftId)).toMatchObject({
        state: 'closed',
        arrivalConfirmedAt: now,
      });
    }, 20_000);
  });
});
