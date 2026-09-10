import { randomUUID } from 'node:crypto';

import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { PurchaseDraftAssemblyService } from 'purchase-drafts/domain/services/purchase-draft-assembly.service.js';
import { AddPurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/add-purchase-draft-line.command.js';
import { ReadyPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/ready-purchase-draft.command.js';
import { RevisePurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/revise-purchase-draft-line.command.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import dataSource from 'shared/database/data-source.js';
import { DbTransactionService } from 'shared/database/db-transaction.service.js';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service.js';
import { AccountEntity } from 'shared/domain/entities/account.entity.js';
import { CustomerEntity } from 'shared/domain/entities/customer.entity.js';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity.js';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity.js';
import { DemandSnapshotEntryEntity } from 'shared/domain/entities/demand-snapshot-entry.entity.js';
import { ItemEntity } from 'shared/domain/entities/item.entity.js';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity.js';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity.js';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity.js';
import { UserEntity } from 'shared/domain/entities/user.entity.js';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity.js';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity.js';
import { CustomerAddressBookRepository } from 'shared/domain/repositories/customer-address-book.repository.js';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository.js';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository.js';
import { PackagingTypeCatalogueRepository } from 'shared/domain/repositories/packaging-type-catalogue.repository.js';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository.js';
import { PurchaseDraftFreezeRepository } from 'shared/domain/repositories/purchase-draft-freeze.repository.js';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// T16 — the freeze of the delivery statement, proven against a real schema because **capturing by
// value is a database-level fact**: a double cannot fail the way a live reference would. The whole
// point of AC-16/AC-17 is that a later edit of the source address has nowhere to travel, and that
// is only provable by editing the source row after the freeze and reading the frozen one back.
//
// The command's own rule-level cases (which refusal is owed, which reads are issued) live beside
// this file in `ready-purchase-draft.command.spec.ts` over doubles; everything here needs the
// store.

const now = new Date('2026-08-26T10:00:00.000Z');
const readiedAt = new Date('2026-08-26T12:00:00.000Z');

const context = new DbTransactionContext(dataSource);
const transactions = new DbTransactionService(dataSource, context);

const assemblyRepository = new PurchaseDraftAssemblyRepository(dataSource);
const freezeRepository = new PurchaseDraftFreezeRepository(dataSource);
const assemblyService = new PurchaseDraftAssemblyService(
  new ItemCatalogueRepository(dataSource),
  new CustomerOrderLifecycleRepository(dataSource),
  new PackagingTypeCatalogueRepository(dataSource),
  assemblyRepository,
);

const readyCommand = new ReadyPurchaseDraftCommand(
  freezeRepository,
  assemblyRepository,
  assemblyService,
  { now: () => readiedAt },
);
const addLineCommand = new AddPurchaseDraftLineCommand(
  assemblyRepository,
  assemblyService,
);
// T19/AC-12 — the real address book, so the revisions this suite performs are proved against the
// same Warehouse-scoped availability read the write path now issues.
const reviseLineCommand = new RevisePurchaseDraftLineCommand(
  assemblyRepository,
  assemblyService,
  new CustomerAddressBookRepository(dataSource),
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

const WAREHOUSE_ADDRESS = 'Dock 4, Test Industrial Estate, Test City';
const WAREHOUSE_ACCESS_NOTES =
  'Report to the gatehouse; deliveries 07:00-15:00';

const seedWarehouse = async ({
  deliveryAddressText = WAREHOUSE_ADDRESS,
  deliveryAccessNotes = WAREHOUSE_ACCESS_NOTES,
}: {
  deliveryAddressText?: string | null;
  deliveryAccessNotes?: string | null;
} = {}): Promise<Seeded> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  const warehouse = buildWarehouse({
    workspaceId: workspace.id!,
    deliveryAddressText,
    deliveryAccessNotes,
  });
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

interface SeededAddress {
  readonly customerId: string;
  readonly customerDeliveryAddressId: string;
}

const seedCustomerAddress = async (
  seeded: Seeded,
  {
    customerName = 'Test Customer North',
    addressText = 'Test Address 1, Test City',
    accessNotes = 'Gate code 4417 on the intercom',
  }: {
    customerName?: string;
    addressText?: string;
    accessNotes?: string | null;
  } = {},
): Promise<SeededAddress> => {
  const customerId = randomUUID();
  const customerDeliveryAddressId = randomUUID();
  await dataSource.manager.getRepository(CustomerEntity).insert({
    id: customerId,
    warehouseId: seeded.warehouseId,
    name: customerName,
    deactivatedAt: null,
    recordedByUserId: seeded.userId,
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(CustomerDeliveryAddressEntity).insert({
    id: customerDeliveryAddressId,
    customerId,
    warehouseId: seeded.warehouseId,
    addressText,
    accessNotes,
    isMain: true,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return { customerId, customerDeliveryAddressId };
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
    customerId: null,
    customerDeliveryAddressId: null,
    customerName: 'Typed Buyer',
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

const seedDraft = async (seeded: Seeded): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id,
    warehouseId: seeded.warehouseId,
    state: 'draft',
    expectedArrivalDate: null,
    createdByUserId: seeded.userId,
    readiedByUserId: null,
    readiedAt: null,
    closedByUserId: null,
    closedAt: null,
    closureReason: null,
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
    discardedByUserId: null,
    discardedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

const seedLine = async (
  seeded: Seeded,
  draftId: string,
  destination: {
    deliveryMode: 'via_warehouse' | 'direct_to_customer';
    customerDeliveryAddressId: string | null;
  } = { deliveryMode: 'via_warehouse', customerDeliveryAddressId: null },
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
    id,
    purchaseDraftId: draftId,
    warehouseId: seeded.warehouseId,
    itemId: seeded.itemId,
    orderedQuantity: 100,
    packagingTypeId: null,
    valueAddingNote: null,
    deliveryMode: destination.deliveryMode,
    customerDeliveryAddressId: destination.customerDeliveryAddressId,
    frozenDeliveryAddressText: null,
    frozenAccessNotes: null,
    frozenCustomerName: null,
    endingQuantity: null,
    endingKind: null,
    endingRecordedByUserId: null,
    endingRecordedAt: null,
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
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftLineLinkEntity).insert({
    id,
    purchaseDraftLineId: lineId,
    purchaseDraftId: draftId,
    warehouseId: seeded.warehouseId,
    customerOrderId,
    statedQuantity: 100,
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
  permissionId: 'PURCHASE_DRAFTS:READY',
  observedPermissionIds: [],
  archived: false,
});

const readLine = async (lineId: string): Promise<PurchaseDraftLineEntity> => {
  const line = await dataSource.manager
    .getRepository(PurchaseDraftLineEntity)
    .findOneBy({ id: lineId });
  if (line === null) {
    throw new Error(`line ${lineId} vanished`);
  }
  return line;
};

const readSnapshot = (
  linkId: string,
): Promise<DemandSnapshotEntryEntity | null> =>
  dataSource.manager
    .getRepository(DemandSnapshotEntryEntity)
    .findOneBy({ purchaseDraftLineLinkId: linkId });

const readyInTransaction = (
  seeded: Seeded,
  draftId: string,
): Promise<unknown> =>
  transactions.executeInTransaction({}, () =>
    readyCommand.execute(currentUserFor(seeded), draftId),
  );

// eslint-disable-next-line max-lines-per-function -- integration suite setup is inherently long
describe('ReadyPurchaseDraftCommand freezing the delivery statement', () => {
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

  // AC-16/AC-17 — the heart of this task. The freeze reads the address out at that instant and
  // writes what it read; afterwards **both** source addresses, the Customer's name and the linked
  // Customer Order's address are all edited, and not one frozen value moves.
  it('captures the delivery statement by value, so a later edit of the source address moves nothing', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded);
    const { customerId, customerDeliveryAddressId } =
      await seedCustomerAddress(seeded);

    const viaLineId = await seedLine(seeded, draftId);
    const directLineId = await seedLine(seeded, draftId, {
      deliveryMode: 'direct_to_customer',
      customerDeliveryAddressId,
    });
    const orderId = await seedCustomerOrder(seeded, {
      customerId,
      customerDeliveryAddressId,
      customerName: null,
    });
    const linkId = await seedLink(seeded, draftId, directLineId, orderId);

    await readyInTransaction(seeded, draftId);

    expect(await readLine(viaLineId)).toMatchObject({
      frozenDeliveryAddressText: WAREHOUSE_ADDRESS,
      frozenAccessNotes: WAREHOUSE_ACCESS_NOTES,
      // AC-16/sad.md §6.8 step 5 — the customer name is the Direct to Customer case only.
      frozenCustomerName: null,
    });
    expect(await readLine(directLineId)).toMatchObject({
      frozenDeliveryAddressText: 'Test Address 1, Test City',
      frozenAccessNotes: 'Gate code 4417 on the intercom',
      frozenCustomerName: 'Test Customer North',
    });
    expect(await readSnapshot(linkId)).toMatchObject({
      capturedCustomerDeliveryAddressId: customerDeliveryAddressId,
      capturedDeliveryAddressText: 'Test Address 1, Test City',
    });

    // Every source of every captured value is now edited in place, exactly as a member correcting
    // an address, its access notes, a Customer's name or the Warehouse's own address would.
    await dataSource.manager
      .getRepository(CustomerDeliveryAddressEntity)
      .update(
        { id: customerDeliveryAddressId },
        {
          addressText: 'Corrected Address 9, Another City',
          accessNotes: 'Gate code changed to 9911',
        },
      );
    await dataSource.manager
      .getRepository(CustomerEntity)
      .update({ id: customerId }, { name: 'Renamed Customer South' });
    await dataSource.manager.getRepository(WarehouseEntity).update(
      { id: seeded.warehouseId },
      {
        deliveryAddressText: 'Relocated Dock 9, Other Estate',
        deliveryAccessNotes: 'New gatehouse; deliveries 06:00-14:00',
      },
    );

    expect(await readLine(viaLineId)).toMatchObject({
      frozenDeliveryAddressText: WAREHOUSE_ADDRESS,
      frozenAccessNotes: WAREHOUSE_ACCESS_NOTES,
      frozenCustomerName: null,
    });
    expect(await readLine(directLineId)).toMatchObject({
      frozenDeliveryAddressText: 'Test Address 1, Test City',
      frozenAccessNotes: 'Gate code 4417 on the intercom',
      frozenCustomerName: 'Test Customer North',
    });
    expect(await readSnapshot(linkId)).toMatchObject({
      capturedDeliveryAddressText: 'Test Address 1, Test City',
    });
  });

  // AC-17 structurally — the frozen statement is **text**, and there is no reference among it for
  // an edit to travel along. Asserted against the real schema rather than against the values,
  // because a captured value that happened to be right would not prove the absence.
  it('leaves no address reference among the frozen statement columns', async () => {
    const frozenColumns: { column_name: string; data_type: string }[] =
      await dataSource.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_name = 'purchase_draft_lines' AND column_name LIKE 'frozen%'
         ORDER BY column_name`,
      );

    expect(frozenColumns).toEqual([
      { column_name: 'frozen_access_notes', data_type: 'text' },
      { column_name: 'frozen_customer_name', data_type: 'text' },
      { column_name: 'frozen_delivery_address_text', data_type: 'text' },
    ]);
  });

  // AC-16a — refused, changing nothing: the draft stays in `draft`, no line is frozen and no
  // Demand Snapshot row is written.
  it('refuses the transition when a Via Warehouse line is on a Warehouse with no Delivery Address, and changes nothing', async () => {
    const seeded = await seedWarehouse({
      deliveryAddressText: null,
      deliveryAccessNotes: null,
    });
    const draftId = await seedDraft(seeded);
    const lineId = await seedLine(seeded, draftId);

    const attempt = readyInTransaction(seeded, draftId);

    await expect(attempt).rejects.toBeInstanceOf(ApplicationError);
    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_WAREHOUSE_DELIVERY_ADDRESS_REQUIRED,
      details: { requiredPermissionId: 'WAREHOUSES:ADDRESS_UPDATE' },
    });

    expect(
      await dataSource.manager
        .getRepository(PurchaseDraftEntity)
        .findOneBy({ id: draftId }),
    ).toMatchObject({ state: 'draft', readiedAt: null });
    expect(await readLine(lineId)).toMatchObject({
      frozenDeliveryAddressText: null,
      frozenAccessNotes: null,
      frozenCustomerName: null,
    });
    expect(
      await dataSource.manager.getRepository(DemandSnapshotEntryEntity).count(),
    ).toBe(0);
  });

  // AC-16a's second half, and the reason it is a **freeze precondition rather than a line-level
  // one**: the draft the transition was refused for is still fully assemblable.
  it('keeps adding and revising lines working on the draft whose readiness was refused for a missing Warehouse address', async () => {
    const seeded = await seedWarehouse({
      deliveryAddressText: null,
      deliveryAccessNotes: null,
    });
    const draftId = await seedDraft(seeded);
    const lineId = await seedLine(seeded, draftId);
    const { customerDeliveryAddressId } = await seedCustomerAddress(seeded);

    await expect(readyInTransaction(seeded, draftId)).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_WAREHOUSE_DELIVERY_ADDRESS_REQUIRED,
    });

    await transactions.executeInTransaction({}, () =>
      addLineCommand.execute(currentUserFor(seeded), draftId, {
        itemId: seeded.itemId,
        orderedQuantity: 40,
      }),
    );
    await transactions.executeInTransaction({}, () =>
      reviseLineCommand.execute(currentUserFor(seeded), draftId, lineId, {
        orderedQuantity: 55,
        destination: {
          deliveryMode: 'direct_to_customer',
          customerDeliveryAddressId,
        },
      }),
    );

    expect(await assemblyRepository.findLines(draftId)).toHaveLength(2);
    expect(await readLine(lineId)).toMatchObject({
      orderedQuantity: 55,
      deliveryMode: 'direct_to_customer',
      customerDeliveryAddressId,
    });
  });

  // AC-15a — the freeze is the third moment the direct-line agreement is required. Every
  // disagreement is named, across every line, and **none is withdrawn**.
  it('refuses a disagreeing link set naming every disagreement, and withdraws none of them', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded);
    const shipsTo = await seedCustomerAddress(seeded, {
      customerName: 'Test Customer North',
      addressText: 'Test Address 1, Test City',
    });
    const goesTo = await seedCustomerAddress(seeded, {
      customerName: 'Test Customer South',
      addressText: 'Test Address 2, Other City',
    });

    const directLineId = await seedLine(seeded, draftId, {
      deliveryMode: 'direct_to_customer',
      customerDeliveryAddressId: shipsTo.customerDeliveryAddressId,
    });
    const strandedOrderId = await seedCustomerOrder(seeded, {
      customerId: goesTo.customerId,
      customerDeliveryAddressId: goesTo.customerDeliveryAddressId,
      customerName: null,
    });
    const typedNameOrderId = await seedCustomerOrder(seeded);
    const strandedLinkId = await seedLink(
      seeded,
      draftId,
      directLineId,
      strandedOrderId,
    );
    const typedNameLinkId = await seedLink(
      seeded,
      draftId,
      directLineId,
      typedNameOrderId,
    );

    const attempt = readyInTransaction(seeded, draftId);

    await expect(attempt).rejects.toBeInstanceOf(ApplicationError);
    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DELIVERY_ADDRESS_DISAGREEMENT,
      details: {
        disagreeingLinks: expect.arrayContaining([
          {
            purchaseDraftLineLinkId: strandedLinkId,
            customerOrderId: strandedOrderId,
            lineDeliveryAddressId: shipsTo.customerDeliveryAddressId,
            customerOrderDeliveryAddressId: goesTo.customerDeliveryAddressId,
          },
          {
            purchaseDraftLineLinkId: typedNameLinkId,
            customerOrderId: typedNameOrderId,
            lineDeliveryAddressId: shipsTo.customerDeliveryAddressId,
            customerOrderDeliveryAddressId: null,
          },
        ]),
      },
    });

    // Withdrawing none of them: both links are still there, and nothing was frozen.
    expect(
      await dataSource.manager
        .getRepository(PurchaseDraftLineLinkEntity)
        .countBy({ purchaseDraftLineId: directLineId }),
    ).toBe(2);
    expect(
      await dataSource.manager
        .getRepository(PurchaseDraftEntity)
        .findOneBy({ id: draftId }),
    ).toMatchObject({ state: 'draft' });
    expect(await readLine(directLineId)).toMatchObject({
      frozenDeliveryAddressText: null,
    });
  });

  // AC-16 — a link to a Customer Order recorded by typed name names no address, and the pairing
  // constraint admits capturing neither half. It stays linkable to a Via Warehouse line (AC-15b).
  it('captures no address for a link whose Customer Order names none', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded);
    const lineId = await seedLine(seeded, draftId);
    const orderId = await seedCustomerOrder(seeded);
    const linkId = await seedLink(seeded, draftId, lineId, orderId);

    await readyInTransaction(seeded, draftId);

    expect(await readSnapshot(linkId)).toMatchObject({
      capturedCustomerDeliveryAddressId: null,
      capturedDeliveryAddressText: null,
      capturedQuantity: 100,
      capturedState: 'unfulfilled',
    });
  });

  // AC-17 — once frozen, no write path targets a line's Delivery Mode or Delivery Address: the
  // assembly writes resolve only `draft`-state drafts, so the frozen statement stands.
  it('refuses to change a frozen line delivery destination and leaves the frozen statement standing', async () => {
    const seeded = await seedWarehouse();
    const draftId = await seedDraft(seeded);
    const lineId = await seedLine(seeded, draftId);
    const { customerDeliveryAddressId } = await seedCustomerAddress(seeded);

    await readyInTransaction(seeded, draftId);

    const attempt = transactions.executeInTransaction({}, () =>
      reviseLineCommand.execute(currentUserFor(seeded), draftId, lineId, {
        destination: {
          deliveryMode: 'direct_to_customer',
          customerDeliveryAddressId,
        },
      }),
    );

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DRAFT_FROZEN,
    });
    expect(await readLine(lineId)).toMatchObject({
      deliveryMode: 'via_warehouse',
      customerDeliveryAddressId: null,
      frozenDeliveryAddressText: WAREHOUSE_ADDRESS,
    });
  });
});
