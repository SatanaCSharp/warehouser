import { randomUUID } from 'node:crypto';

import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { DemandAllocationService } from 'customer-orders/domain/services/demand-allocation.service';
// The application boundary (ADR 0002 "Decision outcome").
import { ConfirmPurchaseDraftArrivalCommand } from 'purchase-drafts/usecases/commands/confirm-purchase-draft-arrival.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
// ADR 0002
// places the whole operation on one `@Transactional()` boundary in `purchase-drafts`, which reads
// the draft row and then its lines, then locks the linked Customer Orders in ascending identifier
// order (sad.md §6.9/§8 — the draft and its lines are read without an explicit row lock; the
// conditional UPDATE is what makes the transition safe, and
// `confirm-purchase-draft-arrival.command.spec.ts` is what proves the boundary itself exists, since
// every test here supplies its own transaction),
// records every line's received quantity, delegates the demand effect to the real
// real `DemandAllocationService`, and moves the draft to Closed — all four landing
// together or not at all (spec.md §6 "Arrival atomicity").
//
// This suite exercises the real repositories and the real `DemandAllocationService` against a real
// database, per `sad.md` §10 "Command integration": a double cannot prove atomicity, a genuine
// concurrent race, or that no Item's On-hand Quantity moves.
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { ArrivalAllocationEntity } from 'shared/domain/entities/arrival-allocation.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import type { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftEntity as PurchaseDraftEntityClass } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { ArrivalConfirmationRepository } from 'shared/domain/repositories/arrival-confirmation.repository';
import { DemandAllocationRepository } from 'shared/domain/repositories/demand-allocation.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
import type { QueryRunner } from 'typeorm';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-26T10:00:00.000Z');
const later = new Date('2026-08-26T12:00:00.000Z');
const neededBy = '2099-01-01';

const context = new DbTransactionContext(dataSource);
const transactions = new DbTransactionService(dataSource, context);

const arrivalConfirmationRepository = new ArrivalConfirmationRepository(
  dataSource,
);
const demandAllocationRepository = new DemandAllocationRepository(dataSource);
const demandAllocationService = new DemandAllocationService(
  demandAllocationRepository,
  { now: () => later },
);

const buildCommand = (
  demand: Pick<DemandAllocationService, 'allocate'> = demandAllocationService,
): ConfirmPurchaseDraftArrivalCommand =>
  new ConfirmPurchaseDraftArrivalCommand(
    arrivalConfirmationRepository,
    demand as DemandAllocationService,
    { now: () => later },
  );

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
    onHandQuantity: 42,
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
  await dataSource.manager.getRepository(PurchaseDraftEntityClass).insert({
    id,
    warehouseId: seeded.warehouseId,
    state,
    expectedArrivalDate: '2026-09-02',
    createdByUserId: seeded.userId,
    readiedByUserId: state === 'draft' ? null : seeded.userId,
    readiedAt: state === 'draft' ? null : now,
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
  packagingTypeId: string | null = null,
  valueAddingNote: string | null = null,
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
    id,
    purchaseDraftId: draftId,
    warehouseId: seeded.warehouseId,
    itemId: seeded.itemId,
    orderedQuantity,
    packagingTypeId,
    valueAddingNote,
    receivedQuantity: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

const seedCustomerOrder = async (
  seeded: Seeded,
  overrides: Partial<CustomerOrderEntity> = {},
): Promise<string> => {
  const id = overrides.id ?? randomUUID();
  await dataSource.manager.getRepository(CustomerOrderEntity).insert({
    id,
    warehouseId: seeded.warehouseId,
    itemId: seeded.itemId,
    customerName: 'Test Customer North',
    quantity: 100,
    outstandingQuantity: 100,
    neededBy,
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

const currentUserFor = (seeded: Seeded): AccessCurrentUser => ({
  userId: seeded.userId,
  warehouseId: seeded.warehouseId,
  roleId: randomUUID(),
  roleKind: 'custom',
  permissionId: 'PURCHASE_DRAFTS:RECEIVE',
  archived: false,
});

const readDraft = (id: string): Promise<PurchaseDraftEntity | null> =>
  dataSource.manager.getRepository(PurchaseDraftEntityClass).findOneBy({ id });

const readLine = (id: string): Promise<PurchaseDraftLineEntity | null> =>
  dataSource.manager.getRepository(PurchaseDraftLineEntity).findOneBy({ id });

const readOrder = (id: string): Promise<CustomerOrderEntity | null> =>
  dataSource.manager.getRepository(CustomerOrderEntity).findOneBy({ id });

const readItem = (id: string): Promise<ItemEntity | null> =>
  dataSource.manager.getRepository(ItemEntity).findOneBy({ id });

const readAllocationsForLine = (
  purchaseDraftLineId: string,
): Promise<ArrivalAllocationEntity[]> =>
  dataSource.manager
    .getRepository(ArrivalAllocationEntity)
    .find({ where: { purchaseDraftLineId } });

// eslint-disable-next-line max-lines-per-function -- integration suite setup is inherently long
describeIntegration('ConfirmPurchaseDraftArrivalCommand', () => {
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

  // AC-17/AC-17a/AC-17b — one line arrives short of what was ordered and is split across two
  // linked Customer Orders (one fully covered, one partly), a second line arrives in excess of
  // what was ordered with no allocation because its only link has since gone dead, and the whole
  // draft moves to Closed in the same transaction.
  it('records every line whether short, over or nothing, allocates within bounds, and closes the draft (AC-17/AC-17a/AC-17b)', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'ready_for_ordering');

    const shortLineId = await seedLine(seeded, draftId, 150);
    const fullyAssignedOrderId = await seedCustomerOrder(seeded, {
      quantity: 60,
      outstandingQuantity: 60,
    });
    const partlyAssignedOrderId = await seedCustomerOrder(seeded, {
      quantity: 80,
      outstandingQuantity: 80,
    });
    const linkToFull = await seedLink(
      seeded,
      draftId,
      shortLineId,
      fullyAssignedOrderId,
      60,
    );
    const linkToPartly = await seedLink(
      seeded,
      draftId,
      shortLineId,
      partlyAssignedOrderId,
      40,
    );

    const overLineId = await seedLine(seeded, draftId, 20);
    const deadOrderId = await seedCustomerOrder(seeded, {
      quantity: 10,
      outstandingQuantity: 0,
      state: 'fulfilled',
    });
    await seedLink(seeded, draftId, overLineId, deadOrderId, 10);

    const command = buildCommand();

    const confirmed = await transactions.executeInTransaction({}, () =>
      command.execute(currentUserFor(seeded), draftId, {
        lines: [
          {
            purchaseDraftLineId: shortLineId,
            receivedQuantity: 100,
            allocations: [
              { purchaseDraftLineLinkId: linkToFull, allocatedQuantity: 60 },
              { purchaseDraftLineLinkId: linkToPartly, allocatedQuantity: 30 },
            ],
          },
          {
            purchaseDraftLineId: overLineId,
            receivedQuantity: 25,
            allocations: [],
          },
        ],
      }),
    );

    expect(confirmed).toMatchObject({ id: draftId, state: 'closed' });

    expect(await readLine(shortLineId)).toMatchObject({
      receivedQuantity: 100,
    });
    expect(await readLine(overLineId)).toMatchObject({
      receivedQuantity: 25,
    });
    expect(await readDraft(draftId)).toMatchObject({
      state: 'closed',
      arrivalConfirmedByUserId: seeded.userId,
      arrivalConfirmedAt: later,
    });

    // AC-17a — the fully assigned order is Fulfilled and no longer counted; the partly assigned
    // one still counts for the part it did not receive.
    expect(await readOrder(fullyAssignedOrderId)).toMatchObject({
      state: 'fulfilled',
      outstandingQuantity: 0,
    });
    expect(await readOrder(partlyAssignedOrderId)).toMatchObject({
      state: 'unfulfilled',
      outstandingQuantity: 50,
    });

    // AC-17b — the line whose only link is dead records what arrived and no Allocation at all.
    expect(await readAllocationsForLine(overLineId)).toEqual([]);
    expect(await readAllocationsForLine(shortLineId)).toHaveLength(2);
  });

  // AC-18 — each of the three bounds in turn: assigning across a line's linked Customer Orders more
  // than was recorded as arrived for that line, assigning to one Customer Order more than it is
  // still waiting for, and assigning to a linked Customer Order since cancelled or already
  // Fulfilled. Every one of them blocks the whole confirmation, **records nothing of it** (no
  // received quantity, no Allocation, the draft still Ready for Ordering, every Outstanding
  // Quantity untouched) and names which assignment it will not accept and why — the `details`
  // the error carries, not merely its code.
  //
  // The first three cases are arranged so that exactly one bound fails, which is what makes the
  // named violation evidence that *that* bound was enforced rather than an incidental by-product of
  // another. The fourth cannot be: `chk_customer_orders_state_outstanding` forces a Fulfilled order
  // to `outstanding_quantity = 0`, so any assignment to one breaches the outstanding bound too.
  // What it pins is therefore the **precedence** — a dead order is reported as dead, not as a
  // stale outstanding-quantity overshoot, because its Outstanding Quantity is not a meaningful
  // floor. The per-bound rules themselves are unit-tested in
  // `customer-orders/domain/services/demand-allocation.service.spec.ts` (T9); what is proved here
  // is that each of them reaches through the confirmation and leaves the database untouched.
  interface BoundCase {
    readonly orderOverrides: Partial<CustomerOrderEntity>;
    readonly receivedQuantity: number;
    readonly allocatedQuantity: number;
    readonly expectedViolation: (ids: {
      lineId: string;
      linkId: string;
    }) => Record<string, unknown>;
  }

  const boundCases: ReadonlyArray<[string, BoundCase]> = [
    [
      'assigns across a line more than arrived for it',
      {
        orderOverrides: { quantity: 100, outstandingQuantity: 100 },
        receivedQuantity: 40,
        allocatedQuantity: 60,
        expectedViolation: ({ lineId }) => ({
          purchaseDraftLineId: lineId,
          rule: 'allocations_exceed_received_quantity',
          receivedQuantity: 40,
          allocatedQuantity: 60,
        }),
      },
    ],
    [
      'assigns to one Customer Order more than it is still waiting for',
      {
        orderOverrides: { quantity: 100, outstandingQuantity: 50 },
        receivedQuantity: 100,
        allocatedQuantity: 60,
        expectedViolation: ({ linkId }) => ({
          purchaseDraftLineLinkId: linkId,
          rule: 'exceeds_outstanding_quantity',
          outstandingQuantity: 50,
          allocatedQuantity: 60,
        }),
      },
    ],
    [
      'assigns to a Customer Order since cancelled',
      {
        orderOverrides: {
          quantity: 100,
          outstandingQuantity: 100,
          state: 'cancelled',
          cancellationReason: 'Customer withdrew the order',
          cancelledAt: now,
        },
        receivedQuantity: 100,
        allocatedQuantity: 10,
        expectedViolation: ({ linkId }) => ({
          purchaseDraftLineLinkId: linkId,
          rule: 'customer_order_not_unfulfilled',
          customerOrderState: 'cancelled',
        }),
      },
    ],
    [
      'assigns to a Customer Order already Fulfilled',
      {
        orderOverrides: {
          quantity: 100,
          outstandingQuantity: 0,
          state: 'fulfilled',
        },
        receivedQuantity: 100,
        allocatedQuantity: 10,
        expectedViolation: ({ linkId }) => ({
          purchaseDraftLineLinkId: linkId,
          rule: 'customer_order_not_unfulfilled',
          customerOrderState: 'fulfilled',
        }),
      },
    ],
  ];

  it.each(boundCases)(
    'blocks the whole confirmation, records nothing of it and names the refused assignment when it %s (AC-18)',
    async (_bound, testCase) => {
      const seeded = await seedWarehouse();
      const draftId = await seedDraft(seeded, 'ready_for_ordering');
      const lineId = await seedLine(seeded, draftId, 100);
      const orderId = await seedCustomerOrder(seeded, {
        ...testCase.orderOverrides,
        // `chk_customer_orders_cancellation_attribution` wants the acting member alongside the
        // reason; it is only knowable once the Warehouse is seeded.
        ...(testCase.orderOverrides.state === 'cancelled'
          ? { cancelledByUserId: seeded.userId }
          : {}),
      });
      const linkId = await seedLink(seeded, draftId, lineId, orderId, 50);

      const orderBefore = await readOrder(orderId);
      const command = buildCommand();

      const rejection = transactions.executeInTransaction({}, () =>
        command.execute(currentUserFor(seeded), draftId, {
          lines: [
            {
              purchaseDraftLineId: lineId,
              receivedQuantity: testCase.receivedQuantity,
              allocations: [
                {
                  purchaseDraftLineLinkId: linkId,
                  allocatedQuantity: testCase.allocatedQuantity,
                },
              ],
            },
          ],
        }),
      );

      await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
      await expect(rejection).rejects.toMatchObject({
        code: ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS,
      });

      // "tells the member which assignment it will not accept and why" — the refusal names this
      // bound and only this bound, so the member can correct exactly the assignment that failed.
      const refusal = (await rejection.catch(
        (error: unknown) => error,
      )) as ApplicationError;
      expect(refusal.details).toEqual({
        violations: [testCase.expectedViolation({ lineId, linkId })],
      });

      // "records nothing of it" — every write of the confirmation stays absent.
      expect(await readLine(lineId)).toMatchObject({ receivedQuantity: null });
      expect(await readDraft(draftId)).toMatchObject({
        state: 'ready_for_ordering',
        arrivalConfirmedByUserId: null,
        arrivalConfirmedAt: null,
      });
      expect(await readAllocationsForLine(lineId)).toEqual([]);
      expect(await readOrder(orderId)).toMatchObject({
        outstandingQuantity: orderBefore!.outstandingQuantity,
        state: orderBefore!.state,
      });
    },
  );

  // AC-17b — confirming an arrival closes a draft once and for all; a second confirmation of an
  // already-Closed draft is a typed refusal that records nothing.
  it('refuses a second confirmation of an already Closed draft (AC-17b)', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'closed');
    const lineId = await seedLine(seeded, draftId, 100);

    const command = buildCommand();

    const rejection = transactions.executeInTransaction({}, () =>
      command.execute(currentUserFor(seeded), draftId, {
        lines: [
          { purchaseDraftLineId: lineId, receivedQuantity: 5, allocations: [] },
        ],
      }),
    );

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_ARRIVAL_ALREADY_CONFIRMED,
    });
    expect(await readLine(lineId)).toMatchObject({ receivedQuantity: null });
  });

  // AC-18a — confirming an arrival never moves the On-hand Quantity of any Item on the draft;
  // it moves only through an adjustment that states its reason, which this operation never issues.
  it('leaves every Item On-hand Quantity unchanged (AC-18a)', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'ready_for_ordering');
    const lineId = await seedLine(seeded, draftId, 100);

    const before = await readItem(seeded.itemId);

    const command = buildCommand();
    await transactions.executeInTransaction({}, () =>
      command.execute(currentUserFor(seeded), draftId, {
        lines: [
          {
            purchaseDraftLineId: lineId,
            receivedQuantity: 100,
            allocations: [],
          },
        ],
      }),
    );

    expect(await readItem(seeded.itemId)).toMatchObject({
      onHandQuantity: before!.onHandQuantity,
    });
  });

  // spec.md §6 "Arrival atomicity" — a failure injected mid-way, after the draft/lines are locked
  // and the demand effect is attempted but before it succeeds, must leave nothing recorded: no
  // received quantity, no Allocation, and the draft still Ready for Ordering. Only a real
  // transaction rolling back a real commit can prove this; a double cannot.
  it('rolls back every write when the demand effect fails mid-way (spec.md §6 "Arrival atomicity")', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'ready_for_ordering');
    const lineId = await seedLine(seeded, draftId, 100);
    const orderId = await seedCustomerOrder(seeded, {
      quantity: 100,
      outstandingQuantity: 100,
    });
    const linkId = await seedLink(seeded, draftId, lineId, orderId, 100);

    const injectedFailure = new Error('injected mid-way failure');
    const failingDemandService: Pick<DemandAllocationService, 'allocate'> = {
      allocate: jest.fn().mockRejectedValue(injectedFailure),
    };

    const command = buildCommand(failingDemandService);

    const rejection = transactions.executeInTransaction({}, () =>
      command.execute(currentUserFor(seeded), draftId, {
        lines: [
          {
            purchaseDraftLineId: lineId,
            receivedQuantity: 100,
            allocations: [
              { purchaseDraftLineLinkId: linkId, allocatedQuantity: 100 },
            ],
          },
        ],
      }),
    );

    await expect(rejection).rejects.toBe(injectedFailure);

    expect(await readLine(lineId)).toMatchObject({ receivedQuantity: null });
    expect(await readDraft(draftId)).toMatchObject({
      state: 'ready_for_ordering',
    });
    expect(await readOrder(orderId)).toMatchObject({
      outstandingQuantity: 100,
    });
    expect(await readAllocationsForLine(lineId)).toEqual([]);
  });

  // ===========================================================================================
  // T15 review — the confirmation's payload must be able to reach only the lines of the draft it
  // names. These four are the RED for defects the source-level write-boundary check cannot see,
  // because the write path is correct as *text* and wrong at *row* level.
  // ===========================================================================================

  // spec.md §6.1 "Cross-Warehouse demand reach" + AC-15. A member holding PURCHASE_DRAFTS:RECEIVE
  // in their own Warehouse confirms their own Ready draft and appends a line belonging to another
  // Warehouse's frozen draft. Empty allocations mean no foreign key is involved, so nothing but an
  // explicit membership check stands between the payload and that row.
  it('refuses a submitted line belonging to another Warehouse, and writes nothing (AC-15, spec.md §6.1)', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'ready_for_ordering');
    const ownLineId = await seedLine(seeded, draftId, 100);

    const elsewhere = await seedWarehouse();
    const foreignDraftId = await seedDraft(elsewhere, 'ready_for_ordering');
    const foreignLineId = await seedLine(elsewhere, foreignDraftId, 100);

    const command = buildCommand();

    const rejection = transactions.executeInTransaction({}, () =>
      command.execute(currentUserFor(seeded), draftId, {
        lines: [
          {
            purchaseDraftLineId: ownLineId,
            receivedQuantity: 100,
            allocations: [],
          },
          {
            purchaseDraftLineId: foreignLineId,
            receivedQuantity: 999,
            allocations: [],
          },
        ],
      }),
    );

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT,
    });

    // The other Warehouse's frozen line is untouched and its draft is still Ready for Ordering.
    expect(await readLine(foreignLineId)).toMatchObject({
      receivedQuantity: null,
    });
    expect(await readDraft(foreignDraftId)).toMatchObject({
      state: 'ready_for_ordering',
    });
    // And nothing of the member's own confirmation was recorded either.
    expect(await readLine(ownLineId)).toMatchObject({ receivedQuantity: null });
    expect(await readDraft(draftId)).toMatchObject({
      state: 'ready_for_ordering',
    });
  });

  // The same hole inside one Warehouse: confirming draft B while naming a line of the already
  // Closed draft A would overwrite A's recorded arrival, bypassing the AC-17b refusal that guards
  // A itself.
  it('refuses a submitted line belonging to another draft of the same Warehouse (AC-17b)', async () => {
    const seeded = await seedWarehouse();
    const closedDraftId = await seedDraft(seeded, 'closed');
    const closedLineId = await seedLine(seeded, closedDraftId, 100);
    await dataSource.manager
      .getRepository(PurchaseDraftLineEntity)
      .update({ id: closedLineId }, { receivedQuantity: 70 });

    const openDraftId = await seedDraft(seeded, 'ready_for_ordering');
    const openLineId = await seedLine(seeded, openDraftId, 100);

    const command = buildCommand();

    const rejection = transactions.executeInTransaction({}, () =>
      command.execute(currentUserFor(seeded), openDraftId, {
        lines: [
          {
            purchaseDraftLineId: openLineId,
            receivedQuantity: 100,
            allocations: [],
          },
          {
            purchaseDraftLineId: closedLineId,
            receivedQuantity: 999,
            allocations: [],
          },
        ],
      }),
    );

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT,
    });

    // The Closed draft's recorded arrival stands exactly as it was.
    expect(await readLine(closedLineId)).toMatchObject({
      receivedQuantity: 70,
    });
    expect(await readLine(openLineId)).toMatchObject({
      receivedQuantity: null,
    });
  });

  // AC-18's per-line bound is stated per *line*, not per array element. Repeating one line splits
  // its assignments across two elements, each of which passes the bound alone while together they
  // allocate twice what arrived.
  it('refuses a payload naming one line twice, so the per-line bound cannot be split (AC-18)', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'ready_for_ordering');
    const lineId = await seedLine(seeded, draftId, 100);
    const orderA = await seedCustomerOrder(seeded, {
      quantity: 60,
      outstandingQuantity: 60,
    });
    const orderB = await seedCustomerOrder(seeded, {
      quantity: 60,
      outstandingQuantity: 60,
    });
    const linkA = await seedLink(seeded, draftId, lineId, orderA, 60);
    const linkB = await seedLink(seeded, draftId, lineId, orderB, 60);

    const command = buildCommand();

    const rejection = transactions.executeInTransaction({}, () =>
      command.execute(currentUserFor(seeded), draftId, {
        lines: [
          {
            purchaseDraftLineId: lineId,
            receivedQuantity: 60,
            allocations: [
              { purchaseDraftLineLinkId: linkA, allocatedQuantity: 60 },
            ],
          },
          {
            purchaseDraftLineId: lineId,
            receivedQuantity: 60,
            allocations: [
              { purchaseDraftLineLinkId: linkB, allocatedQuantity: 60 },
            ],
          },
        ],
      }),
    );

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT,
    });

    // 120 units against 60 received were not written.
    expect(await readAllocationsForLine(lineId)).toEqual([]);
    expect(await readLine(lineId)).toMatchObject({ receivedQuantity: null });
    expect(await readOrder(orderA)).toMatchObject({ outstandingQuantity: 60 });
    expect(await readOrder(orderB)).toMatchObject({ outstandingQuantity: 60 });
  });

  // AC-18's outstanding bound is a property of the Customer Order across the whole confirmation,
  // not of one assignment. One draft may hold two lines for one Item both linked to one order
  // (`purchase_draft_lines` carries no unique on `(purchase_draft_id, item_id)`), and each
  // assignment can sit inside the bound while their sum does not. Left unaggregated this drives
  // `outstanding_quantity` negative and `chk_customer_orders_outstanding_bounds` turns it into an
  // untyped 500 rather than the refusal AC-18 requires.
  it('refuses assignments that together exceed one order Outstanding Quantity, as a typed refusal (AC-18)', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'ready_for_ordering');
    const lineOne = await seedLine(seeded, draftId, 60);
    const lineTwo = await seedLine(seeded, draftId, 60);
    const orderId = await seedCustomerOrder(seeded, {
      quantity: 100,
      outstandingQuantity: 100,
    });
    const linkOne = await seedLink(seeded, draftId, lineOne, orderId, 60);
    const linkTwo = await seedLink(seeded, draftId, lineTwo, orderId, 60);

    const command = buildCommand();

    const rejection = transactions.executeInTransaction({}, () =>
      command.execute(currentUserFor(seeded), draftId, {
        lines: [
          {
            purchaseDraftLineId: lineOne,
            receivedQuantity: 60,
            allocations: [
              { purchaseDraftLineLinkId: linkOne, allocatedQuantity: 60 },
            ],
          },
          {
            purchaseDraftLineId: lineTwo,
            receivedQuantity: 60,
            allocations: [
              { purchaseDraftLineLinkId: linkTwo, allocatedQuantity: 60 },
            ],
          },
        ],
      }),
    );

    // A typed, named refusal — not a QueryFailedError surfacing as a generic internal error.
    await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
    const refusal = (await rejection.catch(
      (error: unknown) => error,
    )) as ApplicationError;
    expect(refusal.code).toBe(
      ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS,
    );
    // The second assignment is the one that breaches, judged against what the first left.
    expect(refusal.details).toEqual({
      violations: [
        {
          purchaseDraftLineLinkId: linkTwo,
          rule: 'exceeds_outstanding_quantity',
          outstandingQuantity: 40,
          allocatedQuantity: 60,
        },
      ],
    });

    expect(await readOrder(orderId)).toMatchObject({
      outstandingQuantity: 100,
      state: 'unfulfilled',
    });
    expect(await readAllocationsForLine(lineOne)).toEqual([]);
    expect(await readAllocationsForLine(lineTwo)).toEqual([]);
    expect(await readDraft(draftId)).toMatchObject({
      state: 'ready_for_ordering',
    });
  });

  // openapi.yaml `ArrivalConfirmation.lines` `minItems: 1` — an empty confirmation states nothing
  // arrived at all, which is not a confirmation. Without a domain guard both payload predicates are
  // vacuously true and the draft closes with its arrival attribution set while every
  // `received_quantity` stays `null`: a Closed draft recording nothing. The contract's `minItems`
  // is T16's transport-tier guard; this asserts the invariant holds beneath it.
  it('refuses a confirmation stating no lines, leaving the draft open (AC-17)', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'ready_for_ordering');
    const lineId = await seedLine(seeded, draftId, 100);

    const command = buildCommand();

    const rejection = transactions.executeInTransaction({}, () =>
      command.execute(currentUserFor(seeded), draftId, {
        lines: [],
      }),
    );

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT,
    });

    expect(await readDraft(draftId)).toMatchObject({
      state: 'ready_for_ordering',
      arrivalConfirmedByUserId: null,
      arrivalConfirmedAt: null,
    });
    expect(await readLine(lineId)).toMatchObject({ receivedQuantity: null });
  });

  // spec.md §6 "Arrival atomicity": "a line where nothing arrived records nothing received", and
  // the openapi.yaml request example carries `receivedQuantity: 0` for exactly that line. Zero is
  // a recorded figure, distinct from the `null` of a draft whose arrival was never confirmed
  // (data-model.md `received_quantity`: "`null` until an arrival was confirmed; `0` when nothing
  // came").
  it('records a line where nothing arrived as 0, distinct from never-confirmed null (AC-17b)', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'ready_for_ordering');
    const arrivedLineId = await seedLine(seeded, draftId, 100);
    const nothingLineId = await seedLine(seeded, draftId, 40);

    const command = buildCommand();
    await transactions.executeInTransaction({}, () =>
      command.execute(currentUserFor(seeded), draftId, {
        lines: [
          {
            purchaseDraftLineId: arrivedLineId,
            receivedQuantity: 100,
            allocations: [],
          },
          {
            purchaseDraftLineId: nothingLineId,
            receivedQuantity: 0,
            allocations: [],
          },
        ],
      }),
    );

    expect(await readLine(nothingLineId)).toMatchObject({
      receivedQuantity: 0,
    });
    expect(await readLine(arrivedLineId)).toMatchObject({
      receivedQuantity: 100,
    });
    expect(await readDraft(draftId)).toMatchObject({ state: 'closed' });
  });

  // sad.md §8 — two genuinely concurrent confirmations of one draft leave exactly one succeeding;
  // no partial Allocation from the loser survives. Reuses the two-`QueryRunner`,
  // `pg_stat_activity`-poll technique this feature's other concurrency proofs already establish.
  // The loser here pre-read the draft as `ready_for_ordering` (it was, at read time) and lost the
  // guarded write once the winner committed, so its refusal is `concurrent_change`
  // (`ArrivalConfirmationConflict` `concurrentTransition`), never `arrival_already_confirmed` —
  // that code is reserved for a pre-read that already finds the draft Closed, exercised by the
  // separate test above, following the same invalid-state/concurrent-change split
  // `PurchaseDraftFreezeService` already draws (T13, commit 4f380c0).
  it('lets exactly one of two concurrent confirmations succeed, the loser refused as a concurrent change', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'ready_for_ordering');
    const lineId = await seedLine(seeded, draftId, 100);
    const orderId = await seedCustomerOrder(seeded, {
      quantity: 100,
      outstandingQuantity: 100,
    });
    const linkId = await seedLink(seeded, draftId, lineId, orderId, 100);

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
    const command = buildCommand();

    const confirmed1 = await context.run(runner1.manager, () =>
      command.execute(currentUserFor(seeded), draftId, {
        lines: [
          {
            purchaseDraftLineId: lineId,
            receivedQuantity: 100,
            allocations: [
              { purchaseDraftLineLinkId: linkId, allocatedQuantity: 100 },
            ],
          },
        ],
      }),
    );
    expect(confirmed1).toMatchObject({ id: draftId, state: 'closed' });

    const txn2Result = context.run(runner2.manager, () =>
      command.execute(currentUserFor(seeded), draftId, {
        lines: [
          {
            purchaseDraftLineId: lineId,
            receivedQuantity: 40,
            allocations: [],
          },
        ],
      }),
    );
    txn2Result.catch(() => undefined);

    await waitForBlockedOn(pid2, 'UPDATE "purchase_drafts"');

    await runner1.commitTransaction();
    await runner1.release();

    await expect(txn2Result).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_CONCURRENT_CHANGE,
    });
    await runner2.commitTransaction();
    await runner2.release();

    expect(await readLine(lineId)).toMatchObject({ receivedQuantity: 100 });
    expect(await readAllocationsForLine(lineId)).toHaveLength(1);
  }, 20_000);

  // AC-15/spec.md §6.1 "Allocation as a back door" — the frozen line fields are unreachable through
  // this write path: ordered quantity, Pre-receipt Requirement and Expected Arrival Date stay
  // exactly as they were frozen.
  it('leaves every frozen field untouched (AC-15, spec.md §6.1 "Allocation as a back door")', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'ready_for_ordering');
    const lineId = await seedLine(
      seeded,
      draftId,
      100,
      null,
      'Palletize per spec',
    );

    const beforeLine = await readLine(lineId);
    const beforeDraft = await readDraft(draftId);

    const command = buildCommand();
    await transactions.executeInTransaction({}, () =>
      command.execute(currentUserFor(seeded), draftId, {
        lines: [
          {
            purchaseDraftLineId: lineId,
            receivedQuantity: 100,
            allocations: [],
          },
        ],
      }),
    );

    const afterLine = await readLine(lineId);
    const afterDraft = await readDraft(draftId);

    expect(afterLine).toMatchObject({
      orderedQuantity: beforeLine!.orderedQuantity,
      packagingTypeId: beforeLine!.packagingTypeId,
      valueAddingNote: beforeLine!.valueAddingNote,
    });
    expect(afterDraft).toMatchObject({
      expectedArrivalDate: beforeDraft!.expectedArrivalDate,
      createdByUserId: beforeDraft!.createdByUserId,
      readiedByUserId: beforeDraft!.readiedByUserId,
      readiedAt: beforeDraft!.readiedAt,
    });
  });
});
