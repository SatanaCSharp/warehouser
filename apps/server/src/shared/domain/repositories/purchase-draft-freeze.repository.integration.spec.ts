import { randomUUID } from 'node:crypto';

// `PurchaseDraftFreezeRepository` does not exist yet (T13) — this is the RED for the freeze's
// Demand Snapshot capture, its guarded transition, and the guarded closure/discard transitions
// `sad.md` §6.7/§6.11 and `data-model.md` `purchase_draft_demand_snapshots` require. Every guard
// lives in the write's own `WHERE` clause exactly as `PurchaseDraftAssemblyRepository` established
// (T12): a call against a draft that no longer resolves in the state a transition is legal from
// affects zero rows and returns `false`, never a half-applied change. The genuinely concurrent
// freeze race reuses the two-`QueryRunner`, `pg_stat_activity`-poll technique
// `warehouse-lifecycle.repository.integration.spec.ts` (T11) established for proving a second
// writer actually blocks on the row lock rather than merely running twice in sequence.
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { DemandSnapshotEntryEntity } from 'shared/domain/entities/demand-snapshot-entry.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import type { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftEntity as PurchaseDraftEntityClass } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
// The shape this RED step expects the implementer to expose (tasks/purchase-draft-freeze-and-
// closure.md "What"; data-model.md "purchase_draft_demand_snapshots"). Every guarded write
// mirrors `PurchaseDraftAssemblyRepository`'s established `boolean`-return shape — the typed
// refusal is the service's job (server-error-handling.md §3).
import { PurchaseDraftFreezeRepository } from 'shared/domain/repositories/purchase-draft-freeze.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
import type { QueryRunner } from 'typeorm';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-26T10:00:00.000Z');
const later = new Date('2026-08-26T12:00:00.000Z');

interface FreezeInput {
  readonly purchaseDraftId: string;
  readonly readiedByUserId: string;
  readonly readiedAt: Date;
}

interface CloseInput {
  readonly purchaseDraftId: string;
  readonly closedByUserId: string;
  readonly closedAt: Date;
  readonly closureReason: string;
}

interface DiscardInput {
  readonly purchaseDraftId: string;
  readonly discardedByUserId: string;
  readonly discardedAt: Date;
}

interface PurchaseDraftFreezeRepositoryContract {
  freeze(input: FreezeInput): Promise<boolean>;
  close(input: CloseInput): Promise<boolean>;
  discard(input: DiscardInput): Promise<boolean>;
}

const repository = new PurchaseDraftFreezeRepository(
  dataSource,
) as unknown as PurchaseDraftFreezeRepositoryContract;

const context = new DbTransactionContext(dataSource);
const transactions = new DbTransactionService(dataSource, context);

// `accounts.user_id` / `users.account_id` form a deferred circular FK pair
// (`DEFERRABLE INITIALLY DEFERRED`), so both inserts must land inside the same transaction — the
// pattern every integration spec under this directory uses.
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

const seedCustomerOrder = async (
  seeded: Seeded,
  overrides: Partial<CustomerOrderEntity> = {},
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(CustomerOrderEntity).insert({
    id,
    warehouseId: seeded.warehouseId,
    itemId: seeded.itemId,
    customerName: 'Buyer One',
    quantity: 100,
    outstandingQuantity: 100,
    neededBy: '2099-01-01',
    state: 'unfulfilled',
    cancellationReason: null,
    recordedByUserId: seeded.userId,
    cancelledByUserId: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  return id;
};

const seedDraft = async (
  seeded: Seeded,
  state: PurchaseDraftEntity['state'] = 'draft',
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
    closedByUserId: state === 'closed' ? seeded.userId : null,
    closedAt: state === 'closed' ? now : null,
    closureReason: state === 'closed' ? 'Supplier could not fulfil it' : null,
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
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

const seedLink = async (
  seeded: Seeded,
  draftId: string,
  lineId: string,
  customerOrderId: string,
  statedQuantity = 100,
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftLineLinkEntity).insert({
    id,
    purchaseDraftLineId: lineId,
    purchaseDraftId: draftId,
    warehouseId: seeded.warehouseId,
    customerOrderId,
    statedQuantity,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

const readDraft = (id: string): Promise<PurchaseDraftEntity | null> =>
  dataSource.manager.getRepository(PurchaseDraftEntityClass).findOneBy({ id });

const readSnapshotsForLine = (
  purchaseDraftLineId: string,
): Promise<DemandSnapshotEntryEntity[]> =>
  dataSource.manager
    .getRepository(DemandSnapshotEntryEntity)
    .find({ where: { purchaseDraftLineId } });

// Each transition is run through one module-level helper rather than an inline
// `executeInTransaction(… , () => repository.x(…))` at every call site: inside a `describe.each`
// the inline form nests five callbacks deep and trips `max-nested-callbacks`. Hoisting the arrow
// here keeps every assertion body flat without suppressing the rule.

const freezeInTransaction = (input: FreezeInput): Promise<boolean> =>
  transactions.executeInTransaction({}, () => repository.freeze(input));

const closeInTransaction = (input: CloseInput): Promise<boolean> =>
  transactions.executeInTransaction({}, () => repository.close(input));

const discardInTransaction = (input: DiscardInput): Promise<boolean> =>
  transactions.executeInTransaction({}, () => repository.discard(input));

// eslint-disable-next-line max-lines-per-function -- integration suite setup is inherently long
describeIntegration('PurchaseDraftFreezeRepository', () => {
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

  describe('freeze', () => {
    // AC-14/sad.md §6.7 — one Demand Snapshot row per link, carrying the linked Customer Order's
    // quantity, needed-by date and state exactly as they stand at that moment, written in the same
    // transaction as the transition to Ready for Ordering.
    it('writes exactly one Demand Snapshot row per link with the quantity, needed-by date and state as they then stand, and moves the draft to Ready for Ordering', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'draft');
      const lineId = await seedLine(seeded, draftId, 150);

      const firstOrderId = await seedCustomerOrder(seeded, {
        quantity: 100,
        outstandingQuantity: 60,
        neededBy: '2099-03-01',
        state: 'unfulfilled',
      });
      const secondOrderId = await seedCustomerOrder(seeded, {
        quantity: 40,
        outstandingQuantity: 0,
        neededBy: '2099-05-15',
        state: 'fulfilled',
      });
      const firstLinkId = await seedLink(
        seeded,
        draftId,
        lineId,
        firstOrderId,
        60,
      );
      const secondLinkId = await seedLink(
        seeded,
        draftId,
        lineId,
        secondOrderId,
        40,
      );

      const frozen = await freezeInTransaction({
        purchaseDraftId: draftId,
        readiedByUserId: seeded.userId,
        readiedAt: now,
      });

      expect(frozen).toBe(true);
      expect(await readDraft(draftId)).toMatchObject({
        state: 'ready_for_ordering',
        readiedByUserId: seeded.userId,
        readiedAt: now,
      });

      const snapshots = await readSnapshotsForLine(lineId);
      expect(snapshots).toHaveLength(2);

      const firstSnapshot = snapshots.find(
        (row) => row.purchaseDraftLineLinkId === firstLinkId,
      );
      expect(firstSnapshot).toMatchObject({
        customerOrderId: firstOrderId,
        capturedQuantity: 100,
        capturedNeededBy: '2099-03-01',
        capturedState: 'unfulfilled',
      });

      const secondSnapshot = snapshots.find(
        (row) => row.purchaseDraftLineLinkId === secondLinkId,
      );
      expect(secondSnapshot).toMatchObject({
        customerOrderId: secondOrderId,
        capturedQuantity: 40,
        capturedNeededBy: '2099-05-15',
        capturedState: 'fulfilled',
      });
    });

    // sad.md §8/§6.7 — the transition is conditional on the prior state, so a draft that no
    // longer resolves in the `draft` state (already frozen, closed or discarded) affects zero rows
    // rather than being merged, and writes no snapshot row at all.
    describe.each<[PurchaseDraftEntity['state'], string]>([
      ['ready_for_ordering', 'already Ready for Ordering'],
      ['closed', 'already Closed'],
      ['discarded', 'already discarded'],
    ])('against a draft %s (%s)', (state) => {
      it('affects zero rows and writes no Demand Snapshot row', async () => {
        const seeded = await seedWarehouse();
        const draftId = await seedDraft(seeded, state);
        const lineId = await seedLine(seeded, draftId);
        const before = await readDraft(draftId);

        const frozen = await freezeInTransaction({
          purchaseDraftId: draftId,
          readiedByUserId: seeded.userId,
          readiedAt: later,
        });

        expect(frozen).toBe(false);
        expect(await readDraft(draftId)).toEqual(before);
        expect(await readSnapshotsForLine(lineId)).toHaveLength(0);
      });
    });

    // sad.md §8 — two genuinely concurrent freezes of the same draft leave exactly one
    // succeeding. The second writer's `UPDATE … WHERE state = 'draft'` blocks on the row the first
    // writer's still-uncommitted transaction holds, then re-evaluates its own `WHERE` clause once
    // unblocked and finds the state already moved on — the same guarantee
    // `warehouse-lifecycle.repository.integration.spec.ts` proves for the Workspace-row lock,
    // applied here to the Purchase Draft row.
    it('lets exactly one of two concurrent freezes succeed, the second affecting no row', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'draft');
      const lineId = await seedLine(seeded, draftId);
      const orderId = await seedCustomerOrder(seeded);
      await seedLink(seeded, draftId, lineId, orderId);

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

      // txn1 freezes the draft fully (guarded update, snapshot writes) but does not commit yet —
      // it still holds the row lock the guarded `UPDATE` took.
      const frozen1 = await context.run(runner1.manager, () =>
        repository.freeze({
          purchaseDraftId: draftId,
          readiedByUserId: seeded.userId,
          readiedAt: now,
        }),
      );
      expect(frozen1).toBe(true);

      // txn2 attempts the same freeze concurrently, over a second, independent connection — it
      // must block on the Purchase Draft row rather than proceeding to see the stale `draft` state.
      const txn2Result = context.run(runner2.manager, () =>
        repository.freeze({
          purchaseDraftId: draftId,
          readiedByUserId: seeded.userId,
          readiedAt: later,
        }),
      );
      txn2Result.catch(() => undefined);

      await waitForBlockedOn(pid2, 'UPDATE "purchase_drafts"');

      // txn1 commits, releasing the row lock.
      await runner1.commitTransaction();
      await runner1.release();

      // txn2 unblocks only after txn1's commit, re-evaluates its own `WHERE state = 'draft'`
      // clause against the now-committed `ready_for_ordering` state, and affects zero rows.
      const frozen2 = await txn2Result;
      expect(frozen2).toBe(false);
      await runner2.commitTransaction();
      await runner2.release();

      // Exactly one Demand Snapshot row survives — the loser wrote none.
      expect(await readSnapshotsForLine(lineId)).toHaveLength(1);
      expect(await readDraft(draftId)).toMatchObject({
        state: 'ready_for_ordering',
        readiedAt: now,
      });
    }, 20_000);
  });

  describe('close', () => {
    // AC-21 — closure resolves a frozen draft, records the reason, the acting member and the
    // time, keeps the frozen contents readable, and leaves every linked Outstanding Quantity
    // untouched.
    it('closes a frozen draft with the reason, member and time, and leaves linked Outstanding Quantity untouched', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const lineId = await seedLine(seeded, draftId);
      const orderId = await seedCustomerOrder(seeded, {
        outstandingQuantity: 35,
      });
      await seedLink(seeded, draftId, lineId, orderId);

      const closed = await closeInTransaction({
        purchaseDraftId: draftId,
        closedByUserId: seeded.userId,
        closedAt: later,
        closureReason: 'The supplier cannot fulfil the order',
      });

      expect(closed).toBe(true);
      expect(await readDraft(draftId)).toMatchObject({
        state: 'closed',
        closedByUserId: seeded.userId,
        closedAt: later,
        closureReason: 'The supplier cannot fulfil the order',
      });

      const order = await dataSource.manager
        .getRepository(CustomerOrderEntity)
        .findOneBy({ id: orderId });
      expect(order).toMatchObject({ outstandingQuantity: 35 });

      // The frozen contents stay readable.
      const lines = await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .find({ where: { purchaseDraftId: draftId } });
      expect(lines).toHaveLength(1);
    });

    // sad.md §6.11 — closure resolves only from Ready for Ordering; every other state affects
    // zero rows.
    describe.each<[PurchaseDraftEntity['state'], string]>([
      ['draft', 'still in the draft state'],
      ['closed', 'already Closed'],
      ['discarded', 'already discarded'],
    ])('against a draft %s (%s)', (state) => {
      it('affects zero rows', async () => {
        const seeded = await seedWarehouse();
        const draftId = await seedDraft(seeded, state);
        const before = await readDraft(draftId);

        const closed = await closeInTransaction({
          purchaseDraftId: draftId,
          closedByUserId: seeded.userId,
          closedAt: later,
          closureReason: 'The supplier cannot fulfil the order',
        });

        expect(closed).toBe(false);
        expect(await readDraft(draftId)).toEqual(before);
      });
    });
  });

  describe('discard', () => {
    // AC-24 — a Draft-state draft is discarded with the acting member and the time, leaving every
    // linked Customer Order exactly as it was.
    it('discards a draft in the draft state with the acting member and the time, leaving linked Customer Orders untouched', async () => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'draft');
      const lineId = await seedLine(seeded, draftId);
      const orderId = await seedCustomerOrder(seeded, {
        outstandingQuantity: 100,
        state: 'unfulfilled',
      });
      await seedLink(seeded, draftId, lineId, orderId);

      const discarded = await discardInTransaction({
        purchaseDraftId: draftId,
        discardedByUserId: seeded.userId,
        discardedAt: later,
      });

      expect(discarded).toBe(true);
      expect(await readDraft(draftId)).toMatchObject({
        state: 'discarded',
        discardedByUserId: seeded.userId,
        discardedAt: later,
      });

      const order = await dataSource.manager
        .getRepository(CustomerOrderEntity)
        .findOneBy({ id: orderId });
      expect(order).toMatchObject({
        outstandingQuantity: 100,
        state: 'unfulfilled',
      });
    });

    // AC-24a — a draft that has been made ready is closed with a reason rather than discarded;
    // discarding it affects zero rows.
    describe.each<[PurchaseDraftEntity['state'], string]>([
      ['ready_for_ordering', 'made ready'],
      ['closed', 'already Closed'],
      ['discarded', 'already discarded'],
    ])('against a draft %s (%s)', (state) => {
      it('affects zero rows', async () => {
        const seeded = await seedWarehouse();
        const draftId = await seedDraft(seeded, state);
        const before = await readDraft(draftId);

        const discarded = await discardInTransaction({
          purchaseDraftId: draftId,
          discardedByUserId: seeded.userId,
          discardedAt: later,
        });

        expect(discarded).toBe(false);
        expect(await readDraft(draftId)).toEqual(before);
      });
    });
  });
});
