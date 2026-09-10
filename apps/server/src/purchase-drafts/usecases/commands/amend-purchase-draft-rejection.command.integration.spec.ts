import { randomUUID } from 'node:crypto';

import { ErrorCode } from '@warehouser/shared-types/enums';
import { AmendPurchaseDraftRejectionCommand } from 'purchase-drafts/usecases/commands/amend-purchase-draft-rejection.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { ArrivalAllocationEntity } from 'shared/domain/entities/arrival-allocation.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import type { PurchaseDraftLineRejectionDisposition } from 'shared/domain/entities/purchase-draft-line-rejection.entity';
import { PurchaseDraftLineRejectionEntity } from 'shared/domain/entities/purchase-draft-line-rejection.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { PurchaseDraftRejectionRepository } from 'shared/domain/repositories/purchase-draft-rejection.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// T11/AC-18 — **the first write this product aims at a Closed draft** (sad.md §6.4, and the notes of
// `tasks/amend-rejection-command.md`). The command's state precondition is the Rejection and never
// the draft's state, which is a claim about a real schema and a real closed draft rather than about
// a double: only the store can show that the amendment lands and that its postcondition holds —
// "no quantity, Reason, Source or line changed, so no Allocation, outstanding quantity or draft
// state moved, and no other read changed" (sad.md §6.4 postcondition).
//
// So the assertion here is not that the command returned. It is a **full before/after comparison of
// everything hanging off that Closed draft** — the draft row, both of its lines, its links, its
// Allocations, the Customer Order the Allocation feeds, and every Rejection except the amended one —
// with only the amended row's six amendment columns allowed to differ.
//
// The rule-level cases (which refusal is owed and what it carries) live beside this file in
// `amend-purchase-draft-rejection.command.spec.ts` over doubles.

const now = new Date('2026-09-07T09:00:00.000Z');
const raisedAt = new Date('2026-09-07T10:00:00.000Z');
const amendedAt = new Date('2026-09-19T14:05:00.000Z');

const context = new DbTransactionContext(dataSource);
const transactions = new DbTransactionService(dataSource, context);

const command = new AmendPurchaseDraftRejectionCommand(
  new PurchaseDraftRejectionRepository(dataSource),
  { now: () => amendedAt },
);

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

interface SeededDraft {
  readonly warehouseId: string;
  readonly userId: string;
  readonly draftId: string;
  readonly refusedLineId: string;
  readonly untouchedLineId: string;
  readonly customerOrderId: string;
  readonly amendableRejectionId: string;
  readonly siblingRejectionId: string;
  readonly otherLineRejectionId: string;
}

const seedLine = async (
  warehouseId: string,
  itemId: string,
  userId: string,
  draftId: string,
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
    id,
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
  return id;
};

const seedRejection = async (
  warehouseId: string,
  userId: string,
  lineId: string,
  fields: {
    rejectionReasonId: string;
    quantity: number;
    description: string | null;
    disposition: PurchaseDraftLineRejectionDisposition;
  },
): Promise<string> => {
  const id = randomUUID();
  const decided = fields.disposition !== 'undecided';
  await dataSource.manager
    .getRepository(PurchaseDraftLineRejectionEntity)
    .insert({
      id,
      purchaseDraftLineId: lineId,
      warehouseId,
      deliveryMode: 'via_warehouse',
      rejectionReasonId: fields.rejectionReasonId,
      quantity: fields.quantity,
      source: 'inspected',
      description: fields.description,
      disposition: fields.disposition,
      raisedByUserId: userId,
      amendedByUserId: decided ? userId : null,
      amendedAt: decided ? raisedAt : null,
      createdAt: raisedAt,
      updatedAt: raisedAt,
    });
  return id;
};

/**
 * A **Closed** draft carrying everything the amendment must leave alone: two ended lines, a link
 * from the refused line to a Customer Order, the Allocation that link records, and three
 * Rejections — the one to amend, a sibling on the same line, and one on the other line.
 */
const seedClosedDraft = async (): Promise<SeededDraft> => {
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
    arrivalConfirmedByUserId: userId,
    arrivalConfirmedAt: raisedAt,
    closedByUserId: userId,
    closedAt: raisedAt,
    closureReason: null,
    discardedByUserId: null,
    discardedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  const refusedLineId = await seedLine(warehouseId, itemId, userId, draftId);
  const untouchedLineId = await seedLine(warehouseId, itemId, userId, draftId);

  const customerOrderId = randomUUID();
  await dataSource.manager.getRepository(CustomerOrderEntity).insert({
    id: customerOrderId,
    warehouseId,
    itemId,
    customerId: null,
    customerDeliveryAddressId: null,
    customerName: 'Typed Buyer',
    quantity: 100,
    // The Outstanding Quantity the ending already reduced. If the amendment moved a quantity, this
    // is the figure that would move with it.
    outstandingQuantity: 40,
    neededBy: '2099-01-01',
    state: 'unfulfilled',
    cancellationReason: null,
    recordedByUserId: userId,
    cancelledByUserId: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  });

  const linkId = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftLineLinkEntity).insert({
    id: linkId,
    purchaseDraftLineId: refusedLineId,
    purchaseDraftId: draftId,
    warehouseId,
    customerOrderId,
    statedQuantity: 60,
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(ArrivalAllocationEntity).insert({
    purchaseDraftLineLinkId: linkId,
    purchaseDraftLineId: refusedLineId,
    customerOrderId,
    allocatedQuantity: 60,
    allocatedByUserId: userId,
    createdAt: raisedAt,
  });

  return {
    warehouseId,
    userId,
    draftId,
    refusedLineId,
    untouchedLineId,
    customerOrderId,
    amendableRejectionId: await seedRejection(
      warehouseId,
      userId,
      refusedLineId,
      {
        rejectionReasonId: 'damaged_in_transit',
        quantity: 5,
        description: 'Crushed on the pallet corner',
        disposition: 'undecided',
      },
    ),
    siblingRejectionId: await seedRejection(
      warehouseId,
      userId,
      refusedLineId,
      {
        rejectionReasonId: 'quality_defect',
        quantity: 3,
        description: 'Seal split',
        disposition: 'held_for_return',
      },
    ),
    otherLineRejectionId: await seedRejection(
      warehouseId,
      userId,
      untouchedLineId,
      {
        rejectionReasonId: 'damaged_in_transit',
        quantity: 2,
        description: null,
        disposition: 'scrapped_on_site',
      },
    ),
  };
};

const currentUserFor = (seeded: SeededDraft): AccessCurrentUser => ({
  userId: seeded.userId,
  warehouseId: seeded.warehouseId,
  roleId: randomUUID(),
  roleKind: 'custom',
  permissionId: 'REJECTIONS:UPDATE',
  observedPermissionIds: [],
  archived: false,
});

/**
 * Everything hanging off one draft, read in a stable order. Compared whole, so a column nobody
 * thought to name is still compared: a future writer who adds one to the amendment fails this.
 */
const snapshotDraft = async (seeded: SeededDraft) => ({
  draft: await dataSource.manager
    .getRepository(PurchaseDraftEntity)
    .findOneBy({ id: seeded.draftId }),
  lines: await dataSource.manager.getRepository(PurchaseDraftLineEntity).find({
    where: { purchaseDraftId: seeded.draftId },
    order: { id: 'ASC' },
  }),
  links: await dataSource.manager
    .getRepository(PurchaseDraftLineLinkEntity)
    .find({ where: { purchaseDraftId: seeded.draftId }, order: { id: 'ASC' } }),
  allocations: await dataSource.manager
    .getRepository(ArrivalAllocationEntity)
    .find({ order: { purchaseDraftLineLinkId: 'ASC' } }),
  customerOrders: await dataSource.manager
    .getRepository(CustomerOrderEntity)
    .find({ order: { id: 'ASC' } }),
  otherRejections: await dataSource.manager
    .getRepository(PurchaseDraftLineRejectionEntity)
    .find({ order: { id: 'ASC' } })
    .then((rows) =>
      rows.filter((row) => row.id !== seeded.amendableRejectionId),
    ),
});

const readRejection = (
  id: string,
): Promise<PurchaseDraftLineRejectionEntity | null> =>
  dataSource.manager
    .getRepository(PurchaseDraftLineRejectionEntity)
    .findOneBy({ id });

describe('AmendPurchaseDraftRejectionCommand over a Closed draft', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE purchase_draft_line_rejections, arrival_allocations, purchase_draft_line_links, purchase_draft_lines, purchase_drafts, customer_orders, items, warehouses, workspaces, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  // AC-18 — the telephone call happens after closure. The draft is `closed` and stays `closed`, and
  // the amendment lands anyway: the precondition is the Rejection.
  it('amends a Rejection whose draft is Closed, and moves nothing else on that draft', async () => {
    const seeded = await seedClosedDraft();
    const before = await snapshotDraft(seeded);

    const amendment = await transactions.executeInTransaction({}, () =>
      command.execute(currentUserFor(seeded), seeded.amendableRejectionId, {
        description: 'Crushed across two pallet corners',
        disposition: 'held_for_return',
      }),
    );

    expect(amendment).toEqual({
      id: seeded.amendableRejectionId,
      description: 'Crushed across two pallet corners',
      disposition: 'held_for_return',
      amendedByUserId: seeded.userId,
      amendedAt,
    });

    // The postcondition, whole: the draft row, both lines, the link, the Allocation, the Customer
    // Order carrying the Outstanding Quantity, and the two Rejections this amendment was not about
    // are byte-for-byte what they were.
    expect(await snapshotDraft(seeded)).toEqual(before);
    expect(before.draft).toMatchObject({ state: 'closed' });

    // And on the amended row itself: only the description, the Disposition and the attribution
    // moved. The quantity, the Reason, the Source, the line and the raising member did not
    // (spec.md §6 "Condition immutability").
    expect(await readRejection(seeded.amendableRejectionId)).toMatchObject({
      description: 'Crushed across two pallet corners',
      disposition: 'held_for_return',
      amendedByUserId: seeded.userId,
      amendedAt,
      quantity: 5,
      rejectionReasonId: 'damaged_in_transit',
      source: 'inspected',
      purchaseDraftLineId: seeded.refusedLineId,
      raisedByUserId: seeded.userId,
      createdAt: raisedAt,
    });
  });

  // AC-18b over the real schema — the description alone, on a Closed draft, still attributed, and
  // the Disposition standing on the row untouched.
  it('records a description-only amendment on a Closed draft with the acting member and the time', async () => {
    const seeded = await seedClosedDraft();
    const neighbourBefore = await readRejection(seeded.amendableRejectionId);

    await transactions.executeInTransaction({}, () =>
      command.execute(currentUserFor(seeded), seeded.siblingRejectionId, {
        description: 'Seal split along the whole length',
      }),
    );

    expect(await readRejection(seeded.siblingRejectionId)).toMatchObject({
      description: 'Seal split along the whole length',
      disposition: 'held_for_return',
      amendedByUserId: seeded.userId,
      amendedAt,
      quantity: 3,
      rejectionReasonId: 'quality_defect',
    });
    // The line's other Rejection is not swept along by an amendment scoped to its neighbour.
    expect(await readRejection(seeded.amendableRejectionId)).toEqual(
      neighbourBefore,
    );
    expect(
      await dataSource.manager
        .getRepository(CustomerOrderEntity)
        .findOneBy({ id: seeded.customerOrderId }),
    ).toMatchObject({ outstandingQuantity: 40, state: 'unfulfilled' });
  });

  // AC-18a against the real conditional update — the refusal is the store's zero-row result, and
  // the row it refused is exactly as it was, attribution included.
  it('refuses a return to Undecided on a Closed draft and leaves the Rejection as it was', async () => {
    const seeded = await seedClosedDraft();
    const before = await readRejection(seeded.siblingRejectionId);

    const attempt = transactions.executeInTransaction({}, () =>
      command.execute(currentUserFor(seeded), seeded.siblingRejectionId, {
        disposition: 'undecided',
      }),
    );

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DISPOSITION_NOT_REVERSIBLE,
      details: { currentDisposition: 'held_for_return' },
    });
    expect(await readRejection(seeded.siblingRejectionId)).toEqual(before);
  });

  // The edge no acceptance criterion covers, pinned as accepted (see the command's own review
  // notes): `undecided` aimed at a Rejection that is still `undecided` matches the repository's
  // conditional update and writes only the attribution. Proved here against the real predicate
  // rather than only against a stub that already assumes `affected: 1` — T4's own repository
  // integration spec never exercises this shape, so this is the only store-level proof of it.
  it('accepts Undecided aimed at a Rejection that is still Undecided, writing only the attribution', async () => {
    const seeded = await seedClosedDraft();
    const before = await readRejection(seeded.amendableRejectionId);

    const amendment = await transactions.executeInTransaction({}, () =>
      command.execute(currentUserFor(seeded), seeded.amendableRejectionId, {
        disposition: 'undecided',
      }),
    );

    expect(amendment).toMatchObject({
      id: seeded.amendableRejectionId,
      disposition: 'undecided',
      amendedByUserId: seeded.userId,
      amendedAt,
    });
    expect(await readRejection(seeded.amendableRejectionId)).toMatchObject({
      ...before,
      disposition: 'undecided',
      amendedByUserId: seeded.userId,
      amendedAt,
      updatedAt: amendedAt,
    });
  });

  // AC-26 through the real resolve — a Rejection of another Warehouse fails identically to one that
  // does not exist, and the foreign row does not move. Both Warehouses hold a real Rejection, so an
  // implementation that simply failed to find anything would not pass.
  it('fails identically for a Rejection of another Warehouse and for one that does not exist', async () => {
    const acting = await seedClosedDraft();
    const other = await seedClosedDraft();
    const foreignBefore = await readRejection(other.amendableRejectionId);

    const foreign = transactions.executeInTransaction({}, () =>
      command.execute(currentUserFor(acting), other.amendableRejectionId, {
        disposition: 'held_for_return',
      }),
    );
    const missing = transactions.executeInTransaction({}, () =>
      command.execute(currentUserFor(acting), randomUUID(), {
        disposition: 'held_for_return',
      }),
    );

    await expect(foreign).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    await expect(missing).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    expect(await readRejection(other.amendableRejectionId)).toEqual(
      foreignBefore,
    );
  });
});
