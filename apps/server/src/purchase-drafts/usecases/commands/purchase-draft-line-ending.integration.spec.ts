import { randomUUID } from 'node:crypto';

import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { DemandAllocationService } from 'customer-orders/domain/services/demand-allocation.service';
// The application boundary (ADR 0002 "Decision outcome").
import { ConfirmPurchaseDraftLineArrivalCommand } from 'purchase-drafts/usecases/commands/confirm-purchase-draft-line-arrival.command';
import { RecordPurchaseDraftLineDeliveryCommand } from 'purchase-drafts/usecases/commands/record-purchase-draft-line-delivery.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
// T17/ADR 0002 — the whole-draft arrival is withdrawn and replaced by **two per-line endings**
// whose kind is a routing fact. Each places its whole act on one `@Transactional()` boundary in
// `purchase-drafts`: it reads the draft row and then the named line, writes that line's ending,
// delegates the demand effect to the real `DemandAllocationService` (which locks the linked
// Customer Orders in ascending identifier order, sad.md §6.10/§8), and closes the draft **only when
// no line of it is left without an ending** — all of it landing together or not at all (spec.md §6
// "Ending atomicity").
//
// The draft and its line are read without an explicit row lock; the conditional UPDATEs are what
// make both transitions safe, and `purchase-draft-line-ending.spec.ts` is what proves the
// `@Transactional()` boundary itself exists, since every test here supplies its own transaction.
//
// This suite exercises the real repositories and the real `DemandAllocationService` against a real
// database, per `sad.md` §10 "Command integration": a double cannot prove atomicity, a genuine
// concurrent race, or that no Item's On-hand Quantity moves.
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { ArrivalAllocationEntity } from 'shared/domain/entities/arrival-allocation.entity';
import { CustomerEntity } from 'shared/domain/entities/customer.entity';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
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

const buildArrivalCommand = (
  demand: Pick<DemandAllocationService, 'allocate'> = demandAllocationService,
): ConfirmPurchaseDraftLineArrivalCommand =>
  new ConfirmPurchaseDraftLineArrivalCommand(
    arrivalConfirmationRepository,
    demand as DemandAllocationService,
    { now: () => later },
  );

const buildDeliveryCommand = (
  demand: Pick<DemandAllocationService, 'allocate'> = demandAllocationService,
): RecordPurchaseDraftLineDeliveryCommand =>
  new RecordPurchaseDraftLineDeliveryCommand(
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

// `chk_purchase_draft_lines_delivery_mode_address` — a Direct to Customer line names a Customer
// Delivery Address and a Via Warehouse line names none. Seeded on demand rather than for every
// draft, so a Via Warehouse fixture stays the minimal row it was.
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
    addressText: '12 Dock Road, Portside',
    accessNotes: null,
    isMain: true,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return addressId;
};

const seedLine = async (
  seeded: Seeded,
  draftId: string,
  orderedQuantity = 100,
  deliveryMode: 'via_warehouse' | 'direct_to_customer' = 'via_warehouse',
): Promise<string> => {
  const id = randomUUID();
  const customerDeliveryAddressId =
    deliveryMode === 'direct_to_customer'
      ? await seedCustomerDeliveryAddress(seeded)
      : null;
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
    id,
    purchaseDraftId: draftId,
    warehouseId: seeded.warehouseId,
    itemId: seeded.itemId,
    orderedQuantity,
    packagingTypeId: null,
    valueAddingNote: null,
    receivedQuantity: null,
    deliveryMode,
    customerDeliveryAddressId,
    endingQuantity: null,
    endingKind: null,
    endingRecordedByUserId: null,
    endingRecordedAt: null,
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
  observedPermissionIds: [],
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
describe('per-line endings (T17, ADR 0002)', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE arrival_allocations, purchase_draft_demand_snapshots, purchase_draft_line_links, purchase_draft_lines, purchase_drafts, item_stock_adjustments, customer_orders, customer_delivery_addresses, customers, items, warehouse_memberships, roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  // AC-19, the whole point of the feature: a draft holding one line of each mode, whose goods reach
  // the dock and the customer on different days. The draft stays Ready for Ordering across the
  // first ending and moves to Closed on the second, and each ending reduces what its own named
  // customer is still waiting for.
  it('ends each line independently and closes the draft on the last one (AC-19)', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'ready_for_ordering');

    const dockLineId = await seedLine(seeded, draftId, 100, 'via_warehouse');
    const directLineId = await seedLine(
      seeded,
      draftId,
      40,
      'direct_to_customer',
    );
    const dockOrderId = await seedCustomerOrder(seeded, { quantity: 100 });
    const directOrderId = await seedCustomerOrder(seeded, {
      quantity: 40,
      outstandingQuantity: 40,
    });
    const dockLinkId = await seedLink(
      seeded,
      draftId,
      dockLineId,
      dockOrderId,
      100,
    );
    const directLinkId = await seedLink(
      seeded,
      draftId,
      directLineId,
      directOrderId,
      40,
    );

    // Day one — what reached the dock.
    const first = await transactions.executeInTransaction({}, () =>
      buildArrivalCommand().execute(
        currentUserFor(seeded),
        draftId,
        dockLineId,
        {
          receivedQuantity: 100,
          allocations: [
            { purchaseDraftLineLinkId: dockLinkId, allocatedQuantity: 100 },
          ],
        },
      ),
    );

    // "leaves the draft in Ready for Ordering for as long as any of its lines still has no ending"
    expect(first.state).toBe('ready_for_ordering');
    expect(await readDraft(draftId)).toMatchObject({
      state: 'ready_for_ordering',
      closedAt: null,
    });
    expect(await readLine(dockLineId)).toMatchObject({
      endingQuantity: 100,
      endingKind: 'arrival',
      endingRecordedByUserId: seeded.userId,
    });
    // The other line is untouched: an ending is per line, not per draft.
    expect(await readLine(directLineId)).toMatchObject({
      endingQuantity: null,
      endingKind: null,
      endingRecordedAt: null,
    });
    expect(await readOrder(dockOrderId)).toMatchObject({
      outstandingQuantity: 0,
      state: 'fulfilled',
    });
    expect(await readOrder(directOrderId)).toMatchObject({
      outstandingQuantity: 40,
      state: 'unfulfilled',
    });

    // Days later — what the customer received.
    const second = await transactions.executeInTransaction({}, () =>
      buildDeliveryCommand().execute(
        currentUserFor(seeded),
        draftId,
        directLineId,
        {
          deliveredQuantity: 40,
          allocations: [
            { purchaseDraftLineLinkId: directLinkId, allocatedQuantity: 40 },
          ],
        },
      ),
    );

    // "moves it to Closed once every one of them has"
    expect(second.state).toBe('closed');
    expect(await readDraft(draftId)).toMatchObject({
      state: 'closed',
      closedByUserId: seeded.userId,
      // The closure carries no reason: `chk_purchase_drafts_closure_path` is what tells an
      // ending-driven closure from a member's closure with one (AC-21a).
      closureReason: null,
    });
    expect(await readLine(directLineId)).toMatchObject({
      endingQuantity: 40,
      endingKind: 'direct_delivery',
    });
    expect(await readOrder(directOrderId)).toMatchObject({
      outstandingQuantity: 0,
      state: 'fulfilled',
    });
  });

  // AC-20 — both directions, against a real row rather than a double, because the refusal has to
  // hold when `chk_purchase_draft_lines_ending_matches_mode` is also watching.
  it.each([
    {
      name: 'a dock arrival against a Direct to Customer line',
      mode: 'direct_to_customer' as const,
      run: (draftId: string, lineId: string, seeded: Seeded) =>
        buildArrivalCommand().execute(currentUserFor(seeded), draftId, lineId, {
          receivedQuantity: 10,
          allocations: [],
        }),
    },
    {
      name: 'a direct delivery against a Via Warehouse line',
      mode: 'via_warehouse' as const,
      run: (draftId: string, lineId: string, seeded: Seeded) =>
        buildDeliveryCommand().execute(
          currentUserFor(seeded),
          draftId,
          lineId,
          {
            deliveredQuantity: 10,
            allocations: [],
          },
        ),
    },
  ])('refuses $name, changing nothing (AC-20)', async ({ mode, run }) => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'ready_for_ordering');
    const lineId = await seedLine(seeded, draftId, 100, mode);

    const rejection = transactions.executeInTransaction({}, () =>
      run(draftId, lineId, seeded),
    );

    await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_ENDING_MODE_MISMATCH,
      // "tells the member which of the two ways that line's goods travelled"
      details: { deliveryMode: mode },
    });
    expect(await readLine(lineId)).toMatchObject({
      endingQuantity: null,
      endingRecordedAt: null,
    });
    expect(await readDraft(draftId)).toMatchObject({
      state: 'ready_for_ordering',
    });
  });

  // AC-20a — the second ending is refused, nothing changes, and nothing further is assigned to any
  // Customer Order. The refusal names when and by whom the first was recorded.
  it('refuses a second ending on one line and assigns nothing further (AC-20a)', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'ready_for_ordering');
    const lineId = await seedLine(seeded, draftId, 100, 'via_warehouse');
    const otherLineId = await seedLine(seeded, draftId, 10, 'via_warehouse');
    const orderId = await seedCustomerOrder(seeded, { quantity: 100 });
    const linkId = await seedLink(seeded, draftId, lineId, orderId, 100);

    await transactions.executeInTransaction({}, () =>
      buildArrivalCommand().execute(currentUserFor(seeded), draftId, lineId, {
        receivedQuantity: 60,
        allocations: [
          { purchaseDraftLineLinkId: linkId, allocatedQuantity: 60 },
        ],
      }),
    );
    const orderAfterFirst = await readOrder(orderId);
    const allocationsAfterFirst = await readAllocationsForLine(lineId);

    const rejection = transactions.executeInTransaction({}, () =>
      buildArrivalCommand().execute(currentUserFor(seeded), draftId, lineId, {
        receivedQuantity: 40,
        allocations: [
          { purchaseDraftLineLinkId: linkId, allocatedQuantity: 40 },
        ],
      }),
    );

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_ENDING_ALREADY_RECORDED,
      details: {
        endingKind: 'arrival',
        endingRecordedByUserId: seeded.userId,
        endingRecordedAt: later.toISOString(),
      },
    });

    // "changes nothing" — the first ending's quantity stands, not the second's.
    expect(await readLine(lineId)).toMatchObject({ endingQuantity: 60 });
    // "assigns nothing further to any Customer Order"
    expect(await readOrder(orderId)).toMatchObject({
      outstandingQuantity: orderAfterFirst!.outstandingQuantity,
    });
    expect(await readAllocationsForLine(lineId)).toHaveLength(
      allocationsAfterFirst.length,
    );
    // And the refused ending did not close the draft either — the other line still has none.
    expect(await readDraft(draftId)).toMatchObject({
      state: 'ready_for_ordering',
    });
    expect(await readLine(otherLineId)).toMatchObject({
      endingRecordedAt: null,
    });
  });

  // spec.md §6 "Ending atomicity" — a failure injected mid-way, after the line's ending is written
  // and while the demand effect is being applied. The ending, the Allocations and the Outstanding
  // Quantity land "together or not at all", which only a real transaction can prove.
  it('rolls back the ending, its Allocations and the demand effect when the demand half fails mid-way', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'ready_for_ordering');
    const lineId = await seedLine(seeded, draftId, 100, 'via_warehouse');
    const orderId = await seedCustomerOrder(seeded, { quantity: 100 });
    const linkId = await seedLink(seeded, draftId, lineId, orderId, 100);

    const injectedFailure = new Error('injected mid-way failure');
    const failingDemand = {
      allocate: jest.fn().mockRejectedValue(injectedFailure),
    };

    const rejection = transactions.executeInTransaction({}, () =>
      buildArrivalCommand(failingDemand).execute(
        currentUserFor(seeded),
        draftId,
        lineId,
        {
          receivedQuantity: 100,
          allocations: [
            { purchaseDraftLineLinkId: linkId, allocatedQuantity: 100 },
          ],
        },
      ),
    );

    await expect(rejection).rejects.toBe(injectedFailure);

    // The ending was written before the demand effect ran, so this is the assertion that the
    // rollback actually happened rather than the write never having been attempted.
    expect(failingDemand.allocate).toHaveBeenCalledTimes(1);
    expect(await readLine(lineId)).toMatchObject({
      endingQuantity: null,
      endingKind: null,
      endingRecordedAt: null,
    });
    expect(await readDraft(draftId)).toMatchObject({
      state: 'ready_for_ordering',
      closedAt: null,
    });
    expect(await readAllocationsForLine(lineId)).toEqual([]);
    expect(await readOrder(orderId)).toMatchObject({
      outstandingQuantity: 100,
      state: 'unfulfilled',
    });
  });

  // AC-19 — "a line where nothing arrived or nothing was delivered records nothing assigned". `0`
  // is an ending, so it still closes the draft when it is the last line.
  it('records a line where nothing arrived as an ending with no Allocation at all', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'ready_for_ordering');
    const lineId = await seedLine(seeded, draftId, 100, 'via_warehouse');
    const orderId = await seedCustomerOrder(seeded, { quantity: 100 });
    await seedLink(seeded, draftId, lineId, orderId, 100);

    const result = await transactions.executeInTransaction({}, () =>
      buildArrivalCommand().execute(currentUserFor(seeded), draftId, lineId, {
        receivedQuantity: 0,
        allocations: [],
      }),
    );

    expect(result.state).toBe('closed');
    expect(await readLine(lineId)).toMatchObject({
      endingQuantity: 0,
      endingKind: 'arrival',
    });
    expect(await readAllocationsForLine(lineId)).toEqual([]);
    // Nothing arrived, so the customer is still waiting for all of it.
    expect(await readOrder(orderId)).toMatchObject({
      outstandingQuantity: 100,
      state: 'unfulfilled',
    });
  });

  // AC-21 — neither ending moves an Item's On-hand Quantity. It moves only through an adjustment
  // that states its reason, and the directly-shipped goods were never in the Transit Zone to be
  // counted in the first place.
  it('moves no On-hand Quantity on either ending (AC-21)', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'ready_for_ordering');
    const dockLineId = await seedLine(seeded, draftId, 100, 'via_warehouse');
    const directLineId = await seedLine(
      seeded,
      draftId,
      40,
      'direct_to_customer',
    );
    const onHandBefore = (await readItem(seeded.itemId))!.onHandQuantity;

    await transactions.executeInTransaction({}, () =>
      buildArrivalCommand().execute(
        currentUserFor(seeded),
        draftId,
        dockLineId,
        { receivedQuantity: 100, allocations: [] },
      ),
    );
    await transactions.executeInTransaction({}, () =>
      buildDeliveryCommand().execute(
        currentUserFor(seeded),
        draftId,
        directLineId,
        { deliveredQuantity: 40, allocations: [] },
      ),
    );

    expect(await readDraft(draftId)).toMatchObject({ state: 'closed' });
    expect((await readItem(seeded.itemId))!.onHandQuantity).toBe(onHandBefore);
  });

  // spec.md §6.1 "Allocation as a back door" — the line is resolved through the composite tuple, so
  // naming a line of another draft of the same Warehouse cannot reach it. The refusal is the same
  // one a missing line gets, so it discloses nothing either.
  it('refuses a line belonging to another draft, leaving that draft untouched', async () => {
    const seeded = await seedWarehouse();
    const otherDraftId = await seedDraft(seeded, 'ready_for_ordering');
    const otherLineId = await seedLine(seeded, otherDraftId, 100);
    const draftId = await seedDraft(seeded, 'ready_for_ordering');
    await seedLine(seeded, draftId, 100);

    const rejection = transactions.executeInTransaction({}, () =>
      buildArrivalCommand().execute(
        currentUserFor(seeded),
        draftId,
        otherLineId,
        { receivedQuantity: 999, allocations: [] },
      ),
    );

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    expect(await readLine(otherLineId)).toMatchObject({
      endingQuantity: null,
      endingRecordedAt: null,
    });
    expect(await readDraft(otherDraftId)).toMatchObject({
      state: 'ready_for_ordering',
    });
  });

  // AC-19/sad.md §6.10 step 5 — closing with a reason stays a whole-draft act available at any
  // time, closing the draft whatever lines remain unrecorded. Proven here from the ending side: a
  // draft closed that way is no longer in Ready for Ordering, so an ending against its remaining
  // line is refused rather than silently recorded onto a Closed draft.
  it('refuses an ending on a draft that is no longer Ready for Ordering', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded, 'closed');
    const lineId = await seedLine(seeded, draftId, 100, 'via_warehouse');

    const rejection = transactions.executeInTransaction({}, () =>
      buildArrivalCommand().execute(currentUserFor(seeded), draftId, lineId, {
        receivedQuantity: 5,
        allocations: [],
      }),
    );

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_INVALID_STATE,
    });
    expect(await readLine(lineId)).toMatchObject({ endingQuantity: null });
  });
});
