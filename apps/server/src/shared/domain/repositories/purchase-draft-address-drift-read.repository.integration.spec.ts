import { randomUUID } from 'node:crypto';

import { RejectionReasonLabelService } from 'purchase-drafts/domain/services/rejection-reason-label.service';
// T18 — AC-11b/AC-18/AC-18a/AC-22 against `PurchaseDraftReadRepository`. Address Drift is a
// **value comparison** between the Delivery Address captured in the Demand Snapshot and the
// address the Customer Order names now: nothing about it is stored and no job repairs one, which
// is what makes a redirection visible on the very next read and makes the report stop the moment
// the order is redirected back (spec.md §6 "Address-drift freshness", sad.md §6.9, openapi.yaml
// `DriftSignalKind.delivery_address_changed`). The by-line split (AC-22) is proved here too,
// because it reads the same rows through the same line projection.
//
// A file of its own rather than more blocks on
// `purchase-draft-read.repository.integration.spec.ts`: that file already sits near the 1000-line
// budget, and these scenarios need Customers and Delivery Addresses that none of its own do.
import { ReadPurchaseDraftQuery } from 'purchase-drafts/usecases/queries/read-purchase-draft.query';
import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerEntity } from 'shared/domain/entities/customer.entity';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { DemandSnapshotEntryEntity } from 'shared/domain/entities/demand-snapshot-entry.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import type { PurchaseDraftLineDeliveryMode } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { PurchaseDraftReadRepository } from 'shared/domain/repositories/purchase-draft-read.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
// `PostgresQueryRunner.prototype.query` is the one method every TypeORM access path ultimately
// calls to reach PostgreSQL. Spying on it proves actual round trips, so an N+1 implementation
// returning identical figures still fails — the idiom
// `consolidated-demand.repository.integration.spec.ts` (T10) establishes.
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
const movedAt = new Date('2026-08-28T09:15:00.000Z');

const ADDRESS_A_TEXT = 'Test Address 1, Test City';
const ADDRESS_A_NOTES = 'Gate code on the intercom; deliveries 09:00-17:00';
const ADDRESS_B_TEXT = 'Test Address 2, Test Town';
const WAREHOUSE_ADDRESS_TEXT = 'Test Warehouse North, Test Industrial Estate';
const WAREHOUSE_ACCESS_NOTES = 'Dock 3; deliveries 07:00-15:00';
const CUSTOMER_NAME = 'Test Customer North';

const repository = new PurchaseDraftReadRepository(dataSource);

const withQueryCount = async <T>(
  run: () => Promise<T>,
): Promise<{ result: T; queryCount: number }> => {
  const spy = vi.spyOn(PostgresQueryRunner.prototype, 'query');
  const before = spy.mock.calls.length;
  const result = await run();
  const queryCount = spy.mock.calls.length - before;
  spy.mockRestore();
  return { result, queryCount };
};

const seedWorkspace = async (): Promise<string> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  return workspace.id as string;
};

const seedWarehouse = async (workspaceId: string): Promise<string> => {
  const warehouse = buildWarehouse({ workspaceId });
  await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);
  return warehouse.id as string;
};

// `accounts.user_id` / `users.account_id` form a deferred circular FK pair, so both inserts must
// land inside the same transaction — the pattern every integration spec here uses.
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

const seedItem = async (warehouseId: string): Promise<string> => {
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
  return itemId;
};

const seedCustomer = async (
  warehouseId: string,
  recordedByUserId: string,
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(CustomerEntity).insert({
    id,
    warehouseId,
    name: CUSTOMER_NAME,
    deactivatedAt: null,
    recordedByUserId,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

const seedDeliveryAddress = async (
  customerId: string,
  warehouseId: string,
  addressText: string,
  accessNotes: string | null = null,
  isMain = false,
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(CustomerDeliveryAddressEntity).insert({
    id,
    customerId,
    warehouseId,
    addressText,
    accessNotes,
    isMain,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

// `chk_customer_orders_customer_identity` admits exactly two shapes: a Customer with one of its
// addresses and no typed name, or a typed name with neither (AC-11a, AC-24).
const seedCustomerOrder = async (
  warehouseId: string,
  itemId: string,
  recordedByUserId: string,
  destination: { customerId: string; addressId: string } | null = null,
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(CustomerOrderEntity).insert({
    id,
    warehouseId,
    itemId,
    customerId: destination?.customerId ?? null,
    customerDeliveryAddressId: destination?.addressId ?? null,
    customerName: destination === null ? 'Buyer One' : null,
    quantity: 10,
    outstandingQuantity: 10,
    neededBy: '2026-09-30',
    state: 'unfulfilled',
    cancellationReason: null,
    recordedByUserId,
    cancelledByUserId: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

const seedPurchaseDraft = async (
  warehouseId: string,
  createdByUserId: string,
  state: 'draft' | 'ready_for_ordering',
  createdAt: Date = now,
): Promise<string> => {
  const id = randomUUID();
  const isReadied = state === 'ready_for_ordering';
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id,
    warehouseId,
    state,
    expectedArrivalDate: null,
    createdByUserId,
    readiedByUserId: isReadied ? createdByUserId : null,
    readiedAt: isReadied ? createdAt : null,
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
    closedByUserId: null,
    closedAt: null,
    closureReason: null,
    discardedByUserId: null,
    discardedAt: null,
    createdAt,
    updatedAt: createdAt,
  });
  return id;
};

// `chk_purchase_draft_lines_delivery_mode_address` and
// `chk_purchase_draft_lines_frozen_capture_shape` hold the mode, the live reference and the frozen
// statement together; a Via Warehouse line names no Customer address and captures no customer name.
const seedPurchaseDraftLine = async (
  purchaseDraftId: string,
  warehouseId: string,
  itemId: string,
  delivery: {
    deliveryMode?: PurchaseDraftLineDeliveryMode;
    customerDeliveryAddressId?: string | null;
    frozenDeliveryAddressText?: string | null;
    frozenAccessNotes?: string | null;
    frozenCustomerName?: string | null;
  } = {},
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
    id,
    purchaseDraftId,
    warehouseId,
    itemId,
    orderedQuantity: 10,
    packagingTypeId: null,
    valueAddingNote: null,
    deliveryMode: delivery.deliveryMode ?? 'via_warehouse',
    customerDeliveryAddressId: delivery.customerDeliveryAddressId ?? null,
    frozenDeliveryAddressText: delivery.frozenDeliveryAddressText ?? null,
    frozenAccessNotes: delivery.frozenAccessNotes ?? null,
    frozenCustomerName: delivery.frozenCustomerName ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

const seedLink = async (
  purchaseDraftLineId: string,
  purchaseDraftId: string,
  warehouseId: string,
  customerOrderId: string,
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftLineLinkEntity).insert({
    id,
    purchaseDraftLineId,
    purchaseDraftId,
    warehouseId,
    customerOrderId,
    statedQuantity: 10,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

// Captured together or not at all
// (`chk_purchase_draft_demand_snapshots_captured_address_pairing`): _not at all_ is the legitimate
// case of a link to a Customer Order recorded by typed name (AC-11a).
const seedSnapshot = async (
  linkId: string,
  lineId: string,
  customerOrderId: string,
  capturedAddress: { id: string; text: string } | null,
): Promise<void> => {
  await dataSource.manager.getRepository(DemandSnapshotEntryEntity).insert({
    purchaseDraftLineLinkId: linkId,
    purchaseDraftLineId: lineId,
    customerOrderId,
    capturedQuantity: 10,
    capturedNeededBy: '2026-09-30',
    capturedState: 'unfulfilled',
    capturedCustomerDeliveryAddressId: capturedAddress?.id ?? null,
    capturedDeliveryAddressText: capturedAddress?.text ?? null,
    createdAt: now,
  });
};

// The redirection T12 records, reduced to the single column the AC-18 comparison reads. Written
// directly rather than through `RedirectCustomerOrderCommand` so this spec proves the *read*
// against a store in the state a redirection leaves it in, without depending on that command.
const redirectCustomerOrder = async (
  customerOrderId: string,
  customerDeliveryAddressId: string,
): Promise<void> => {
  await dataSource.manager
    .getRepository(CustomerOrderEntity)
    .update(
      { id: customerOrderId },
      { customerDeliveryAddressId, updatedAt: movedAt },
    );
};

const findLink = (
  detail: Awaited<ReturnType<typeof repository.readIdentifiedDraft>>,
  linkId: string,
) => detail?.lines.flatMap((line) => line.links).find((l) => l.id === linkId);

interface AddressDriftFixture {
  readonly warehouseId: string;
  readonly userId: string;
  readonly itemId: string;
  readonly customerId: string;
  readonly addressAId: string;
  readonly addressBId: string;
  readonly draftId: string;
  readonly directLineId: string;
  readonly viaLineId: string;
  readonly directOrderId: string;
  readonly viaOrderId: string;
  readonly directLinkId: string;
  readonly viaLinkId: string;
}

// One frozen draft holding both Delivery Modes, each line linked to a Customer Order going to the
// Customer's Main address, and each link's snapshot capturing exactly that address — the AC-18
// starting point from which nothing has drifted yet.
const buildAddressDriftFixture = async (): Promise<AddressDriftFixture> => {
  const workspaceId = await seedWorkspace();
  const warehouseId = await seedWarehouse(workspaceId);
  const userId = await seedUser(workspaceId);
  const itemId = await seedItem(warehouseId);
  const customerId = await seedCustomer(warehouseId, userId);
  const addressAId = await seedDeliveryAddress(
    customerId,
    warehouseId,
    ADDRESS_A_TEXT,
    ADDRESS_A_NOTES,
    true,
  );
  const addressBId = await seedDeliveryAddress(
    customerId,
    warehouseId,
    ADDRESS_B_TEXT,
  );

  const draftId = await seedPurchaseDraft(
    warehouseId,
    userId,
    'ready_for_ordering',
  );
  const viaLineId = await seedPurchaseDraftLine(draftId, warehouseId, itemId, {
    frozenDeliveryAddressText: WAREHOUSE_ADDRESS_TEXT,
    frozenAccessNotes: WAREHOUSE_ACCESS_NOTES,
  });
  const directLineId = await seedPurchaseDraftLine(
    draftId,
    warehouseId,
    itemId,
    {
      deliveryMode: 'direct_to_customer',
      customerDeliveryAddressId: addressAId,
      frozenDeliveryAddressText: ADDRESS_A_TEXT,
      frozenAccessNotes: ADDRESS_A_NOTES,
      frozenCustomerName: CUSTOMER_NAME,
    },
  );

  const seedLinkedOrder = async (lineId: string): Promise<[string, string]> => {
    const orderId = await seedCustomerOrder(warehouseId, itemId, userId, {
      customerId,
      addressId: addressAId,
    });
    const linkId = await seedLink(lineId, draftId, warehouseId, orderId);
    await seedSnapshot(linkId, lineId, orderId, {
      id: addressAId,
      text: ADDRESS_A_TEXT,
    });
    return [orderId, linkId];
  };

  const [viaOrderId, viaLinkId] = await seedLinkedOrder(viaLineId);
  const [directOrderId, directLinkId] = await seedLinkedOrder(directLineId);

  return {
    warehouseId,
    userId,
    itemId,
    customerId,
    addressAId,
    addressBId,
    draftId,
    directLineId,
    viaLineId,
    directOrderId,
    viaOrderId,
    directLinkId,
    viaLinkId,
  };
};

const frozenStateOf = async (
  draftId: string,
): Promise<{ lines: unknown; snapshots: unknown }> => ({
  lines: await dataSource.manager
    .getRepository(PurchaseDraftLineEntity)
    .find({ where: { purchaseDraftId: draftId }, order: { id: 'ASC' } }),
  snapshots: await dataSource.manager
    .getRepository(DemandSnapshotEntryEntity)
    .find({ order: { purchaseDraftLineLinkId: 'ASC' } }),
});

const registerComparisonTests = (): void => {
  // AC-18 — the read hands back, per link, the Delivery Address **frozen** for it and the address
  // the demand **now** expects, in one round trip. Both halves of the comparison, and nothing
  // categorized: naming `delivery_address_changed` is the use case's decision above this
  // repository (creating-a-server-repository.md).
  it('reads the captured Delivery Address beside the address the linked Customer Order names now, in one query', async () => {
    const { warehouseId, draftId, addressAId, directLinkId } =
      await buildAddressDriftFixture();

    const { result: detail, queryCount } = await withQueryCount(() =>
      repository.readIdentifiedDraft(draftId, warehouseId, 'with_cause'),
    );

    expect(queryCount).toBe(1);

    const link = findLink(detail, directLinkId);
    expect(link?.snapshot?.capturedDeliveryAddressId).toBe(addressAId);
    expect(link?.snapshot?.capturedDeliveryAddressText).toBe(ADDRESS_A_TEXT);
    expect(link?.current.deliveryAddress).toEqual({
      deliveryAddressId: addressAId,
      addressText: ADDRESS_A_TEXT,
      accessNotes: ADDRESS_A_NOTES,
      isMain: true,
      deactivatedAt: null,
    });
    expect(detail?.hasDriftSignal).toBe(false);
    expect(detail?.hasDirectToCustomerAddressDrift).toBe(false);
  });

  // data-model.md `purchase_draft_demand_snapshots` — the comparison is on the captured
  // **identifier**, never the captured text. Correcting a typo in an address that was never
  // redirected is not a redirection and must report nothing, while the read still shows the
  // corrected text as the address the demand now expects.
  it('reports no Address Drift when the address text is corrected in place and no redirection happened', async () => {
    const { warehouseId, draftId, addressAId, directLinkId } =
      await buildAddressDriftFixture();

    const correctedText = 'Test Address 1a, Test City';
    await dataSource.manager
      .getRepository(CustomerDeliveryAddressEntity)
      .update({ id: addressAId }, { addressText: correctedText });

    const detail = await repository.readIdentifiedDraft(
      draftId,
      warehouseId,
      'with_cause',
    );
    const link = findLink(detail, directLinkId);

    expect(link?.current.deliveryAddress?.addressText).toBe(correctedText);
    // The frozen statement still says what the supplier was told.
    expect(link?.snapshot?.capturedDeliveryAddressText).toBe(ADDRESS_A_TEXT);
    expect(detail?.hasDriftSignal).toBe(false);
    expect(detail?.hasDirectToCustomerAddressDrift).toBe(false);
  });

  // AC-11a/AC-15b — a link to a Customer Order recorded by typed name captured no address at all
  // and names none now. `NULL` on both sides is agreement, not drift.
  it('reports no Address Drift for a link whose Customer Order was recorded by typed name', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const itemId = await seedItem(warehouseId);
    const draftId = await seedPurchaseDraft(
      warehouseId,
      userId,
      'ready_for_ordering',
    );
    const lineId = await seedPurchaseDraftLine(draftId, warehouseId, itemId);
    const orderId = await seedCustomerOrder(warehouseId, itemId, userId);
    const linkId = await seedLink(lineId, draftId, warehouseId, orderId);
    await seedSnapshot(linkId, lineId, orderId, null);

    const detail = await repository.readIdentifiedDraft(
      draftId,
      warehouseId,
      'with_cause',
    );

    expect(findLink(detail, linkId)?.current.deliveryAddress).toBeNull();
    expect(detail?.hasDriftSignal).toBe(false);
    expect(detail?.hasDirectToCustomerAddressDrift).toBe(false);
  });
};

interface DriftFlags {
  readonly openedDriftSignal: boolean | undefined;
  readonly openedDirectAddressDrift: boolean | undefined;
  readonly listedDriftSignal: boolean | undefined;
  readonly listedDirectAddressDrift: boolean | undefined;
}

const NO_DRIFT: DriftFlags = {
  openedDriftSignal: false,
  openedDirectAddressDrift: false,
  listedDriftSignal: false,
  listedDirectAddressDrift: false,
};

// The two flags as both reads report them, so one assertion covers the opened draft and the list
// together and the freshness sequence reads as the sequence it is.
const driftFlagsOf = async (
  draftId: string,
  warehouseId: string,
): Promise<DriftFlags> => {
  const detail = await repository.readIdentifiedDraft(
    draftId,
    warehouseId,
    'with_cause',
  );
  const [summary] = await repository.listDrafts(warehouseId);

  return {
    openedDriftSignal: detail?.hasDriftSignal,
    openedDirectAddressDrift: detail?.hasDirectToCustomerAddressDrift,
    listedDriftSignal: summary?.hasDriftSignal,
    listedDirectAddressDrift: summary?.hasDirectToCustomerAddressDrift,
  };
};

const registerFreshnessTests = (): void => {
  // AC-11b/AC-18/AC-18a and spec.md §6 "Address-drift freshness" — the whole property, in one
  // test, because the sequence *is* the property: drift appears on the next read after the
  // redirection, and **stops** once the order is redirected back. A stored verdict passes the
  // first half and fails the second.
  it('reports Address Drift on the next read after a redirection and stops reporting once the order is redirected back', async () => {
    const fixture = await buildAddressDriftFixture();
    const { warehouseId, draftId, addressAId, addressBId } = fixture;

    expect(await driftFlagsOf(draftId, warehouseId)).toEqual(NO_DRIFT);

    await redirectCustomerOrder(fixture.directOrderId, addressBId);

    // Reported on the opened draft **and** on the list, because the drifted line ships Direct to
    // Customer (AC-18a).
    expect(await driftFlagsOf(draftId, warehouseId)).toEqual({
      openedDriftSignal: true,
      openedDirectAddressDrift: true,
      listedDriftSignal: true,
      listedDirectAddressDrift: true,
    });

    // The frozen half is untouched; only the live half moved (AC-18).
    const drifted = findLink(
      await repository.readIdentifiedDraft(draftId, warehouseId, 'with_cause'),
      fixture.directLinkId,
    );
    expect(drifted?.snapshot?.capturedDeliveryAddressId).toBe(addressAId);
    expect(drifted?.snapshot?.capturedDeliveryAddressText).toBe(ADDRESS_A_TEXT);
    expect(drifted?.current.deliveryAddress?.deliveryAddressId).toBe(
      addressBId,
    );
    expect(drifted?.current.deliveryAddress?.addressText).toBe(ADDRESS_B_TEXT);

    await redirectCustomerOrder(fixture.directOrderId, addressAId);

    expect(await driftFlagsOf(draftId, warehouseId)).toEqual(NO_DRIFT);
    const restored = findLink(
      await repository.readIdentifiedDraft(draftId, warehouseId, 'with_cause'),
      fixture.directLinkId,
    );
    expect(restored?.current.deliveryAddress?.deliveryAddressId).toBe(
      addressAId,
    );
  });

  // AC-18a — the same disagreement on a **Via Warehouse** line is reported when the draft is
  // opened, and **not** on the list's direct-line flag: everything on such a line lands at one
  // dock either way. `hasDriftSignal` is still raised, because it means "any link of this draft
  // differs in any captured value".
  it('raises the draft-level drift flag but not the direct-line flag when only a Via Warehouse line drifted', async () => {
    const { warehouseId, draftId, addressBId, viaOrderId, viaLinkId } =
      await buildAddressDriftFixture();

    await redirectCustomerOrder(viaOrderId, addressBId);

    const detail = await repository.readIdentifiedDraft(
      draftId,
      warehouseId,
      'with_cause',
    );
    expect(detail?.hasDriftSignal).toBe(true);
    expect(detail?.hasDirectToCustomerAddressDrift).toBe(false);
    expect(
      findLink(detail, viaLinkId)?.current.deliveryAddress?.deliveryAddressId,
    ).toBe(addressBId);

    const [summary] = await repository.listDrafts(warehouseId);
    expect(summary?.hasDriftSignal).toBe(true);
    expect(summary?.hasDirectToCustomerAddressDrift).toBe(false);
  });

  // AC-18 "leaves every frozen value of the draft exactly as it was" — asserted, not assumed:
  // every line row and every snapshot row is compared before and after two redirections and five
  // reads. Nothing about a Drift Signal is stored and no read repairs one.
  it('leaves every frozen value of the draft and every snapshot row exactly as it was across redirections and reads', async () => {
    const fixture = await buildAddressDriftFixture();
    const { warehouseId, draftId, addressAId, addressBId } = fixture;

    const before = await frozenStateOf(draftId);

    await repository.readIdentifiedDraft(draftId, warehouseId, 'with_cause');
    await repository.listDrafts(warehouseId);
    await redirectCustomerOrder(fixture.directOrderId, addressBId);
    await redirectCustomerOrder(fixture.viaOrderId, addressBId);
    await repository.readIdentifiedDraft(draftId, warehouseId, 'with_cause');
    await repository.listIdentifiedLines(warehouseId, {}, 'with_cause');
    await redirectCustomerOrder(fixture.directOrderId, addressAId);
    await repository.readIdentifiedDraft(draftId, warehouseId, 'with_cause');

    expect(await frozenStateOf(draftId)).toEqual(before);
  });

  // The list flag and the derived per-link signal are two views of one comparison; a stored
  // verdict, or a text comparison, makes them disagree.
  it('agrees with the derived per-link Drift Signals about the redirected link', async () => {
    const fixture = await buildAddressDriftFixture();
    const { warehouseId, draftId, addressBId } = fixture;
    await redirectCustomerOrder(fixture.directOrderId, addressBId);

    // No Rejection is involved in an address-drift fixture, so this double never resolves one.
    const query = new ReadPurchaseDraftQuery(
      repository,
      new RejectionReasonLabelService({
        resolveRejectionReasons: vi.fn().mockResolvedValue([]),
      } as never),
    );
    const derived = await query.execute({ warehouseId } as never, draftId);

    const signalled = (derived?.lines ?? [])
      .flatMap((line) => line.links)
      .filter((link) => link.driftSignals.includes('delivery_address_changed'));

    expect(signalled.map((link) => link.id)).toEqual([fixture.directLinkId]);
  });
};

interface ScaleFixture {
  readonly warehouseId: string;
  readonly draftIds: readonly string[];
  readonly redirectedDraftId: string;
}

const DRAFTS_PER_WAREHOUSE = 4;
const LINKS_PER_LINE = 3;
const REDIRECTED_DRAFT_INDEX = 2;
const MODES: readonly PurchaseDraftLineDeliveryMode[] = [
  'via_warehouse',
  'direct_to_customer',
];

// Four frozen drafts, each holding one line of each mode, each line carrying three links — and
// exactly one link of one direct line redirected, so a read that fans out, or that raises a flag
// per Warehouse rather than per draft, cannot pass.
const seedWarehouseAtScale = async (): Promise<ScaleFixture> => {
  const workspaceId = await seedWorkspace();
  const warehouseId = await seedWarehouse(workspaceId);
  const userId = await seedUser(workspaceId);
  const itemId = await seedItem(warehouseId);
  const customerId = await seedCustomer(warehouseId, userId);
  const addressAId = await seedDeliveryAddress(
    customerId,
    warehouseId,
    ADDRESS_A_TEXT,
    ADDRESS_A_NOTES,
    true,
  );
  const addressBId = await seedDeliveryAddress(
    customerId,
    warehouseId,
    ADDRESS_B_TEXT,
  );

  const draftIds: string[] = [];

  for (let draftIndex = 0; draftIndex < DRAFTS_PER_WAREHOUSE; draftIndex += 1) {
    const draftId = await seedPurchaseDraft(
      warehouseId,
      userId,
      'ready_for_ordering',
      new Date(now.getTime() + draftIndex * 60_000),
    );
    draftIds.push(draftId);

    for (const deliveryMode of MODES) {
      const isDirect = deliveryMode === 'direct_to_customer';
      const lineId = await seedPurchaseDraftLine(draftId, warehouseId, itemId, {
        deliveryMode,
        customerDeliveryAddressId: isDirect ? addressAId : null,
        frozenDeliveryAddressText: isDirect
          ? ADDRESS_A_TEXT
          : WAREHOUSE_ADDRESS_TEXT,
        frozenCustomerName: isDirect ? CUSTOMER_NAME : null,
      });

      for (let linkIndex = 0; linkIndex < LINKS_PER_LINE; linkIndex += 1) {
        const redirected =
          draftIndex === REDIRECTED_DRAFT_INDEX && isDirect && linkIndex === 1;
        const orderId = await seedCustomerOrder(warehouseId, itemId, userId, {
          customerId,
          addressId: redirected ? addressBId : addressAId,
        });
        const linkId = await seedLink(lineId, draftId, warehouseId, orderId);
        await seedSnapshot(linkId, lineId, orderId, {
          id: addressAId,
          text: ADDRESS_A_TEXT,
        });
      }
    }
  }

  return {
    warehouseId,
    draftIds,
    redirectedDraftId: draftIds[REDIRECTED_DRAFT_INDEX],
  };
};

const registerScaleTests = (): void => {
  // The Definition of Done's scale condition, and the cost bound sad.md §6.9 attaches to it: many
  // links per draft and many drafts per Warehouse, read in **one** query each.
  it('reports drift across many links per draft and many drafts per Warehouse, in one query per read', async () => {
    const { warehouseId, redirectedDraftId } = await seedWarehouseAtScale();

    const { result: summaries, queryCount: listQueryCount } =
      await withQueryCount(() => repository.listDrafts(warehouseId));

    expect(listQueryCount).toBe(1);
    expect(summaries).toHaveLength(DRAFTS_PER_WAREHOUSE);
    for (const summary of summaries) {
      const isRedirected = summary.id === redirectedDraftId;
      expect(summary.lineCount).toBe(MODES.length);
      expect(summary.hasDriftSignal).toBe(isRedirected);
      expect(summary.hasDirectToCustomerAddressDrift).toBe(isRedirected);
    }

    const { result: detail, queryCount: readQueryCount } = await withQueryCount(
      () =>
        repository.readIdentifiedDraft(
          redirectedDraftId,
          warehouseId,
          'with_cause',
        ),
    );

    expect(readQueryCount).toBe(1);
    expect(detail?.lines).toHaveLength(MODES.length);
    for (const line of detail?.lines ?? []) {
      expect(line.links).toHaveLength(LINKS_PER_LINE);
    }

    const drifted = (detail?.lines ?? [])
      .flatMap((line) => line.links)
      .filter(
        (link) =>
          (link.current.deliveryAddress?.deliveryAddressId ?? null) !==
          link.snapshot?.capturedDeliveryAddressId,
      );
    expect(drifted).toHaveLength(1);
  });

  // The by-line read carries the same scale, and must stay one query too.
  it('serves the by-line split across many drafts in one query', async () => {
    const { warehouseId } = await seedWarehouseAtScale();

    const { result: entries, queryCount } = await withQueryCount(() =>
      repository.listIdentifiedLines(warehouseId, {}, 'with_cause'),
    );

    expect(queryCount).toBe(1);
    expect(entries).toHaveLength(DRAFTS_PER_WAREHOUSE * MODES.length);
    for (const entry of entries) {
      expect(entry.line.links).toHaveLength(LINKS_PER_LINE);
    }
  });
};

const registerByLineTests = (): void => {
  // AC-22 — the by-line split: each line of a draft holding both modes is listed in whichever half
  // **its own** delivery mode places it, so a member preparing the dock sees only the goods they
  // will physically handle.
  it('returns each frozen line of the Warehouse under the Delivery Mode that places it, in one query', async () => {
    const { warehouseId, draftId, directLineId, viaLineId, addressAId } =
      await buildAddressDriftFixture();

    const { result: entries, queryCount } = await withQueryCount(() =>
      repository.listIdentifiedLines(warehouseId, {}, 'with_cause'),
    );

    expect(queryCount).toBe(1);
    expect(entries).toHaveLength(2);

    const byMode = new Map(
      entries.map((entry) => [entry.line.deliveryMode, entry] as const),
    );

    const viaEntry = byMode.get('via_warehouse');
    expect(viaEntry?.line.id).toBe(viaLineId);
    expect(viaEntry?.purchaseDraftId).toBe(draftId);
    expect(viaEntry?.purchaseDraftState).toBe('ready_for_ordering');
    expect(viaEntry?.purchaseDraftReference).toEqual(expect.any(String));
    expect(viaEntry?.expectedArrivalDate).toBeNull();
    // The frozen statement, exactly as the freeze wrote it, now read back through the destination
    // shape T19 projects it as (AC-16, AC-18, openapi.yaml `LineWarehouseDestination`).
    expect(viaEntry?.line.warehouseDestination).toEqual({
      addressText: WAREHOUSE_ADDRESS_TEXT,
      accessNotes: WAREHOUSE_ACCESS_NOTES,
      frozen: true,
    });
    // Exactly one of the two destinations is non-null, which is
    // `chk_purchase_draft_lines_delivery_mode_address` read back.
    expect(viaEntry?.line.customerDestination).toBeNull();

    const directEntry = byMode.get('direct_to_customer');
    expect(directEntry?.line.id).toBe(directLineId);
    expect(directEntry?.line.warehouseDestination).toBeNull();
    expect(directEntry?.line.customerDestination?.addressText).toBe(
      ADDRESS_A_TEXT,
    );
    expect(directEntry?.line.customerDestination?.customerName).toBe(
      CUSTOMER_NAME,
    );
    expect(directEntry?.line.customerDestination?.frozen).toBe(true);
    // data-model.md `purchase_draft_lines` — the live reference stays populated on a frozen direct
    // line, and it is what the by-line read uses.
    expect(
      directEntry?.line.customerDestination?.customerDeliveryAddressId,
    ).toBe(addressAId);
    expect(directEntry?.line.links).toHaveLength(1);
  });

  // openapi.yaml `listPurchaseDraftLines` — `deliveryMode` narrows the response to one half, and
  // the by-line view AC-22 describes is `?state=ready_for_ordering`.
  it('narrows the by-line read to one Delivery Mode and to one draft state', async () => {
    const { warehouseId, directLineId, viaLineId, userId, itemId } =
      await buildAddressDriftFixture();
    const openDraftId = await seedPurchaseDraft(warehouseId, userId, 'draft');
    const openLineId = await seedPurchaseDraftLine(
      openDraftId,
      warehouseId,
      itemId,
    );

    const direct = await repository.listIdentifiedLines(
      warehouseId,
      { deliveryMode: 'direct_to_customer' },
      'with_cause',
    );
    expect(direct.map((entry) => entry.line.id)).toEqual([directLineId]);

    const via = await repository.listIdentifiedLines(
      warehouseId,
      { deliveryMode: 'via_warehouse' },
      'with_cause',
    );
    expect(via.map((entry) => entry.line.id).sort()).toEqual(
      [viaLineId, openLineId].sort(),
    );

    const frozen = await repository.listIdentifiedLines(
      warehouseId,
      { state: 'ready_for_ordering' },
      'with_cause',
    );
    expect(frozen.map((entry) => entry.line.id).sort()).toEqual(
      [viaLineId, directLineId].sort(),
    );
    expect(frozen.map((entry) => entry.line.id)).not.toContain(openLineId);
  });

  // Scoped to the acting Warehouse exactly as both other reads are: a draft held by another
  // Warehouse contributes no line at all (AC-12).
  it('returns no line of a draft held by another Warehouse', async () => {
    const { warehouseId } = await buildAddressDriftFixture();
    const other = await buildAddressDriftFixture();

    const entries = await repository.listIdentifiedLines(
      warehouseId,
      {},
      'with_cause',
    );

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.purchaseDraftId)).not.toContain(
      other.draftId,
    );
  });
};

describe('PurchaseDraftReadRepository Address Drift and the by-line split', () => {
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

  registerComparisonTests();
  registerFreshnessTests();
  registerScaleTests();
  registerByLineTests();
});
