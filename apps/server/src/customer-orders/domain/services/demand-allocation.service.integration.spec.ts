import { randomUUID } from 'node:crypto';

import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
// `DemandAllocationService` does not exist yet (T9) — this is the RED for the half of AC-17a and
// AC-18 that a unit test with a repository double cannot reach: sad.md §8 requires the bounds to be
// re-checked "against locked rows at the moment the change is recorded", and spec.md §6 "Arrival
// atomicity" requires a refused confirmation to record **nothing** of it. Here the service, its
// real repository and a real transaction run together, so what is proven is that a refused
// confirmation leaves every Customer Order and every Allocation row exactly as they were — not
// merely that a double was not called — and that an accepted one recomputes Outstanding Quantity
// and the Fulfilled transition in the stored rows themselves.
//
// Every `service.allocate(...)` call below passes allocations shaped exactly like
// contracts/openapi.yaml `ArrivalAllocationCreate` — `purchaseDraftLineLinkId` and
// `allocatedQuantity` only (`additionalProperties: false`) — never a `customerOrderId`, which the
// contract deliberately omits so the Customer Order is resolved through the link and nothing else.
import { DemandAllocationService } from 'customer-orders/domain/services/demand-allocation.service';
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
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
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

const service = new DemandAllocationService(
  new DemandAllocationRepository(dataSource),
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

const seed = async (): Promise<Seeded> => {
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

interface SeededLink {
  readonly purchaseDraftLineId: string;
  readonly linkId: string;
}

// The link and its ancestry a real `arrival_allocations` row composite-FKs onto
// (`fk_arrival_allocations_link`) — the same chain
// `customer-order-lifecycle.service.integration.spec.ts` builds for its own Allocation fixtures.
const seedLink = async (
  seeded: Seeded,
  customerOrderId: string,
): Promise<SeededLink> => {
  const purchaseDraftId = randomUUID();
  const purchaseDraftLineId = randomUUID();
  const linkId = randomUUID();

  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id: purchaseDraftId,
    warehouseId: seeded.warehouseId,
    state: 'ready_for_ordering',
    expectedArrivalDate: null,
    createdByUserId: seeded.userId,
    readiedByUserId: seeded.userId,
    readiedAt: now,
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
    closedByUserId: null,
    closedAt: null,
    closureReason: null,
    discardedByUserId: null,
    discardedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
    id: purchaseDraftLineId,
    purchaseDraftId,
    warehouseId: seeded.warehouseId,
    itemId: seeded.itemId,
    orderedQuantity: 200,
    packagingTypeId: null,
    valueAddingNote: null,
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(PurchaseDraftLineLinkEntity).insert({
    id: linkId,
    purchaseDraftLineId,
    purchaseDraftId,
    warehouseId: seeded.warehouseId,
    customerOrderId,
    statedQuantity: 1,
    createdAt: now,
    updatedAt: now,
  });

  return { purchaseDraftLineId, linkId };
};

const readOrder = (id: string): Promise<CustomerOrderEntity | null> =>
  dataSource.manager.getRepository(CustomerOrderEntity).findOneBy({ id });

// AC-18 — what the refusal *says* about a bound it broke, registered as a module-level function
// so the suite's own arrow stays within its line budget, the shape
// `purchase-draft-read.repository.integration.spec.ts` already uses.
const registerRefusalDetailTests = (): void => {
  // AC-18/AC-16 — a refused assignment names *when* the order it names moved, so the dialog reads
  // "Test Customer North — cancelled on 26 Aug, so nothing can be assigned to it" (design frame
  // `s5EPi.png`) rather than leaving the member to work out which move is meant. The moment is
  // read from the locked row's `updated_at`, which every path that moves a Customer Order writes.
  it('AC-18: dates the refusal of an order that is no longer Unfulfilled with the moment it moved', async () => {
    const seeded = await seed();
    const cancelledId = await seedCustomerOrder(seeded, {
      state: 'cancelled',
      cancellationReason: 'Customer withdrew the order',
      cancelledByUserId: seeded.userId,
      cancelledAt: later,
      updatedAt: later,
    });
    const link = await seedLink(seeded, cancelledId);

    const rejection = transactions.executeInTransaction({}, () =>
      service.allocate(seeded.warehouseId, seeded.userId, [
        {
          purchaseDraftLineId: link.purchaseDraftLineId,
          assignableQuantity: 100,
          rejectedQuantity: 0,
          allocations: [
            { purchaseDraftLineLinkId: link.linkId, allocatedQuantity: 10 },
          ],
        },
      ]),
    );

    const refusal = (await rejection.catch(
      (error: unknown) => error,
    )) as ApplicationError;

    expect(refusal.code).toBe(
      ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS,
    );
    expect(refusal.details).toEqual({
      violations: [
        {
          purchaseDraftLineLinkId: link.linkId,
          rule: 'customer_order_not_unfulfilled',
          customerOrderState: 'cancelled',
          customerOrderLastChangedAt: later.toISOString(),
        },
      ],
    });
  });

  // AC-18 — the non-enumerating half of the same refusal. A link this transaction locked no
  // Customer Order for — one of another Warehouse — is refused exactly as a cancelled one is, and
  // there is no row to read a moment from, so none is reported rather than one being invented.
  it('AC-18: reports no moment when the refused link resolved to no Customer Order of this Warehouse', async () => {
    const acting = await seed();
    const foreign = await seed();
    const foreignOrderId = await seedCustomerOrder(foreign);
    const foreignLink = await seedLink(foreign, foreignOrderId);

    const rejection = transactions.executeInTransaction({}, () =>
      service.allocate(acting.warehouseId, acting.userId, [
        {
          purchaseDraftLineId: foreignLink.purchaseDraftLineId,
          assignableQuantity: 100,
          rejectedQuantity: 0,
          allocations: [
            {
              purchaseDraftLineLinkId: foreignLink.linkId,
              allocatedQuantity: 10,
            },
          ],
        },
      ]),
    );

    const refusal = (await rejection.catch(
      (error: unknown) => error,
    )) as ApplicationError;

    expect(refusal.details).toEqual({
      violations: [
        {
          purchaseDraftLineLinkId: foreignLink.linkId,
          rule: 'customer_order_not_unfulfilled',
          customerOrderState: 'cancelled',
          customerOrderLastChangedAt: null,
        },
      ],
    });
  });
};

describe('DemandAllocationService', () => {
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

  // AC-17a — "the first Customer Order is Fulfilled and no longer counted, and the second still
  // counts for the part it did not receive", proven against the stored rows a later demand read
  // would see, not against the service's return value alone.
  it('AC-17a: fulfils an order assigned its whole Outstanding Quantity and leaves the other counting for the remainder', async () => {
    const seeded = await seed();
    const fullyAssignedId = await seedCustomerOrder(seeded, {
      quantity: 100,
      outstandingQuantity: 100,
    });
    const partlyAssignedId = await seedCustomerOrder(seeded, {
      quantity: 60,
      outstandingQuantity: 60,
    });
    const linkA = await seedLink(seeded, fullyAssignedId);
    const linkB = await seedLink(seeded, partlyAssignedId);

    await transactions.executeInTransaction({}, () =>
      service.allocate(seeded.warehouseId, seeded.userId, [
        {
          purchaseDraftLineId: linkA.purchaseDraftLineId,
          assignableQuantity: 100,
          rejectedQuantity: 0,
          allocations: [
            {
              purchaseDraftLineLinkId: linkA.linkId,
              allocatedQuantity: 100,
            },
          ],
        },
        {
          purchaseDraftLineId: linkB.purchaseDraftLineId,
          assignableQuantity: 30,
          rejectedQuantity: 0,
          allocations: [
            {
              purchaseDraftLineLinkId: linkB.linkId,
              allocatedQuantity: 30,
            },
          ],
        },
      ]),
    );

    expect(await readOrder(fullyAssignedId)).toMatchObject({
      outstandingQuantity: 0,
      state: 'fulfilled',
    });
    expect(await readOrder(partlyAssignedId)).toMatchObject({
      outstandingQuantity: 30,
      state: 'unfulfilled',
    });
  });

  // AC-18 / spec.md §6 "Arrival atomicity" — "the system blocks the confirmation, records nothing of
  // it". Two lines are submitted together; the second's assignment exceeds its Customer Order's
  // Outstanding Quantity, so the **whole** call is refused and even the first, otherwise-legal line
  // writes nothing — the property a repository double cannot prove because it never risks a partial
  // commit.
  it('AC-18: refuses the whole confirmation and writes nothing when one assignment is out of bounds', async () => {
    const seeded = await seed();
    const legalTargetId = await seedCustomerOrder(seeded, {
      quantity: 100,
      outstandingQuantity: 100,
    });
    const overAssignedId = await seedCustomerOrder(seeded, {
      quantity: 50,
      outstandingQuantity: 20,
    });
    const linkA = await seedLink(seeded, legalTargetId);
    const linkB = await seedLink(seeded, overAssignedId);
    const before = {
      legal: await readOrder(legalTargetId),
      overAssigned: await readOrder(overAssignedId),
    };

    const rejection = transactions.executeInTransaction({}, () =>
      service.allocate(seeded.warehouseId, seeded.userId, [
        {
          purchaseDraftLineId: linkA.purchaseDraftLineId,
          assignableQuantity: 100,
          rejectedQuantity: 0,
          allocations: [
            {
              purchaseDraftLineLinkId: linkA.linkId,
              allocatedQuantity: 100,
            },
          ],
        },
        {
          purchaseDraftLineId: linkB.purchaseDraftLineId,
          assignableQuantity: 40,
          rejectedQuantity: 0,
          allocations: [
            {
              purchaseDraftLineLinkId: linkB.linkId,
              allocatedQuantity: 40,
            },
          ],
        },
      ]),
    );

    await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS,
    });
    expect(await readOrder(legalTargetId)).toEqual(before.legal);
    expect(await readOrder(overAssignedId)).toEqual(before.overAssigned);
    expect(
      await dataSource.manager.getRepository(ArrivalAllocationEntity).count(),
    ).toBe(0);
  });

  registerRefusalDetailTests();

  // sad.md §8 — the bound is re-checked against a row **locked in this transaction**, not against
  // the Outstanding Quantity the caller read before opening it. A concurrent amendment that lowers
  // the floor between the caller's read and the confirmation's write must still be seen.
  it('AC-18: re-checks the bound against the row as it stands at commit time, not as the caller last read it', async () => {
    const seeded = await seed();
    const customerOrderId = await seedCustomerOrder(seeded, {
      quantity: 100,
      outstandingQuantity: 100,
    });
    const link = await seedLink(seeded, customerOrderId);

    const rejection = transactions.executeInTransaction({}, async () => {
      // Simulates a concurrent amendment landing between the moment the member composed this
      // confirmation (Outstanding Quantity 100, so 80 looked legal) and the moment it is recorded.
      await dataSource.manager
        .getRepository(CustomerOrderEntity)
        .update({ id: customerOrderId }, { outstandingQuantity: 20 });

      return service.allocate(seeded.warehouseId, seeded.userId, [
        {
          purchaseDraftLineId: link.purchaseDraftLineId,
          assignableQuantity: 100,
          rejectedQuantity: 0,
          allocations: [
            {
              purchaseDraftLineLinkId: link.linkId,
              allocatedQuantity: 80,
            },
          ],
        },
      ]);
    });

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS,
      details: {
        violations: [
          expect.objectContaining({
            rule: 'exceeds_outstanding_quantity',
            outstandingQuantity: 20,
            allocatedQuantity: 80,
          }),
        ],
      },
    });
  });
});
