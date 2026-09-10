import { randomUUID } from 'node:crypto';

// The shape this RED step expects the implementer to expose (tasks/purchase-draft-drift-read.md
// "What"; data-model.md "purchase_draft_demand_snapshots"/"Repository boundaries";
// openapi.yaml `PurchaseDraftSummary`/`PurchaseDraftLineLink`/`DemandSnapshotEntry`/
// `LinkedCustomerOrderState`/`ArrivalAllocation`).
import { PermissionId } from '@warehouser/shared-types/enums';
import { RejectionReasonLabelService } from 'purchase-drafts/domain/services/rejection-reason-label.service';
import { ReadPurchaseDraftQuery } from 'purchase-drafts/usecases/queries/read-purchase-draft.query';
// `PurchaseDraftReadRepository` does not exist yet (T14) — this is the RED for the read that joins
// the Demand Snapshot against the Customer Orders as they stand now, in one purpose-built query per
// method (sad.md §4 "Derived on read, one query, never materialized"; sad.md §6.8;
// data-model.md "Repository boundaries"). `creating-a-server-repository.md` requires a repository
// to return persistence-oriented values only, so this repository hands back the raw snapshot and
// current-Customer-Order values per link — never a categorized Drift Signal name — leaving the
// value-comparison-to-named-signal decision to the use case above it
// (`read-purchase-draft.query.spec.ts`). What this repository itself must prove: the snapshot rows
// beside the current Customer Order values are read correctly and in one round trip, that a Closed
// draft (whichever route closed it) is still readable, that no read writes anything, and that
// `hasDriftSignal` on the list distinguishes drafts whose snapshot rows still match their demand
// from those that do not (AC-16, AC-16a, AC-21a).
import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { ArrivalAllocationEntity } from 'shared/domain/entities/arrival-allocation.entity';
import type { CustomerOrderState } from 'shared/domain/entities/customer-order.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { DemandSnapshotEntryEntity } from 'shared/domain/entities/demand-snapshot-entry.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
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
// calls to reach PostgreSQL. Spying on it proves actual round trips — the idiom
// `consolidated-demand.repository.integration.spec.ts` (T10) establishes.
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
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
// When a seeded Customer Order moved, for the scenarios that move one. Later than `now`, which is
// what makes it a change rather than the row's own creation.
const movedAt = new Date('2026-08-28T09:15:00.000Z');

// openapi.yaml `DemandSnapshotEntry`.
interface SnapshotRead {
  readonly capturedQuantity: number;
  readonly capturedNeededBy: string;
  readonly capturedState: string;
  readonly capturedDeliveryAddressId: string | null;
  readonly capturedDeliveryAddressText: string | null;
}

// openapi.yaml `LinkedCustomerOrderState`.
interface CurrentDemandRead {
  readonly quantity: number;
  readonly neededBy: string;
  readonly state: string;
  readonly outstandingQuantity: number;
  readonly lastChangedAt: string | null;
  readonly deliveryAddress: { readonly deliveryAddressId: string } | null;
}

// openapi.yaml `ArrivalAllocation`.
interface AllocationRead {
  readonly allocatedQuantity: number;
  readonly allocatedByUserId: string;
  readonly createdAt: Date | string;
}

// The raw per-link comparison inputs — never a named Drift Signal, which is a business decision
// the use case above derives (creating-a-server-repository.md "business decisions belong to the
// owning feature").
interface LinkDemandRead {
  readonly id: string;
  readonly customerOrderId: string;
  readonly customerName: string;
  readonly statedQuantity: number;
  readonly snapshot: SnapshotRead | null;
  readonly current: CurrentDemandRead;
  readonly allocation: AllocationRead | null;
}

interface LineRead {
  readonly id: string;
  readonly itemId: string;
  readonly itemSku: string;
  readonly itemDescription: string;
  readonly unitOfMeasure: string;
  readonly orderedQuantity: number;
  readonly packagingTypeId: string | null;
  readonly valueAddingNote: string | null;
  readonly links: readonly LinkDemandRead[];
}

// openapi.yaml `PurchaseDraftSummary`, minus `driftSignals` (a use-case-derived name, not this
// repository's business).
interface DraftSummaryRead {
  readonly id: string;
  readonly reference: string;
  readonly state: string;
  readonly expectedArrivalDate: string | null;
  readonly lineCount: number;
  readonly hasDriftSignal: boolean;
  readonly hasDirectToCustomerAddressDrift: boolean;
  readonly closureReason: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date | string;
  readonly readiedByUserId: string | null;
  readonly readiedAt: Date | string | null;
  readonly closedByUserId: string | null;
  readonly closedAt: Date | string | null;
  readonly arrivalConfirmedByUserId: string | null;
  readonly arrivalConfirmedAt: Date | string | null;
  readonly discardedByUserId: string | null;
  readonly discardedAt: Date | string | null;
}

interface DraftDetailRead extends DraftSummaryRead {
  readonly lines: readonly LineRead[];
}

// Cast through this interface because `PurchaseDraftReadRepository` is `error`-typed while the
// module does not exist yet.
interface PurchaseDraftReadRepositoryContract {
  listDrafts(warehouseId: string, state?: string): Promise<DraftSummaryRead[]>;
  // T19 — the read is served in two forms, chosen by the observed `CUSTOMERS:WATCH`. This suite
  // exercises the identified one, which is the superset: every column the redacted query selects,
  // it selects too (AC-09a). The redaction itself is proved in
  // `purchase-draft-redaction-read.repository.integration.spec.ts`.
  readIdentifiedDraft(
    purchaseDraftId: string,
    warehouseId: string,
  ): Promise<DraftDetailRead | null>;
}

const repository = new PurchaseDraftReadRepository(
  dataSource,
) as unknown as PurchaseDraftReadRepositoryContract;

// The principal `WarehouseAccessGuard` attaches to a request whose handler declared
// `@ObservedPermission(CUSTOMERS:WATCH)` and whose actor holds it, so the query issues the
// identified read this suite asserts against.
const identifiedActor = (warehouseId: string) =>
  ({
    warehouseId,
    observedPermissionIds: [PermissionId.CUSTOMERS_WATCH],
  }) as never;

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
// land inside the same transaction — the pattern every other integration spec under this
// directory uses.
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

const ITEM_DESCRIPTION = 'Cable reel, 50m';
const ITEM_UNIT_OF_MEASURE = 'each';

interface SeededItem {
  readonly id: string;
  readonly sku: string;
}

const seedItem = async (warehouseId: string): Promise<SeededItem> => {
  const itemId = randomUUID();
  const sku = `SKU-${itemId}`;
  await dataSource.manager.getRepository(ItemEntity).insert({
    id: itemId,
    warehouseId,
    sku,
    description: ITEM_DESCRIPTION,
    unitOfMeasure: ITEM_UNIT_OF_MEASURE,
    onHandQuantity: 0,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return { id: itemId, sku };
};

const seedCustomerOrder = async (
  warehouseId: string,
  itemId: string,
  recordedByUserId: string,
  overrides: {
    quantity?: number;
    outstandingQuantity?: number;
    neededBy?: string;
    state?: CustomerOrderState;
    cancellationReason?: string | null;
    cancelledByUserId?: string | null;
    cancelledAt?: Date | null;
    updatedAt?: Date;
  } = {},
): Promise<string> => {
  const id = randomUUID();
  const quantity = overrides.quantity ?? 10;
  await dataSource.manager.getRepository(CustomerOrderEntity).insert({
    id,
    warehouseId,
    itemId,
    customerName: 'Buyer One',
    quantity,
    outstandingQuantity: overrides.outstandingQuantity ?? quantity,
    neededBy: overrides.neededBy ?? '2026-09-30',
    state: overrides.state ?? 'unfulfilled',
    cancellationReason: overrides.cancellationReason ?? null,
    recordedByUserId,
    cancelledByUserId: overrides.cancelledByUserId ?? null,
    cancelledAt: overrides.cancelledAt ?? null,
    createdAt: now,
    // Every write path that moves a Customer Order sets `updated_at` to the moment of the move
    // (`customer-order-lifecycle.repository.ts`, `demand-allocation.repository.ts`); the insert
    // leaves it equal to `created_at`. A scenario that moved the order says so, so `lastChangedAt`
    // is exercised against the value the production writers would have left.
    updatedAt: overrides.updatedAt ?? now,
  });
  return id;
};

type PurchaseDraftState =
  'draft' | 'ready_for_ordering' | 'closed' | 'discarded';

const seedPurchaseDraft = async (
  warehouseId: string,
  createdByUserId: string,
  state: PurchaseDraftState,
  createdAt: Date = now,
  expectedArrivalDate: string | null = null,
): Promise<string> => {
  const id = randomUUID();
  const isClosedByReason = state === 'closed';
  const isReadied = state === 'ready_for_ordering' || state === 'closed';
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id,
    warehouseId,
    state,
    expectedArrivalDate,
    createdByUserId,
    readiedByUserId: isReadied ? createdByUserId : null,
    readiedAt: isReadied ? createdAt : null,
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
    closedByUserId: isClosedByReason ? createdByUserId : null,
    closedAt: isClosedByReason ? createdAt : null,
    closureReason: isClosedByReason ? 'Supplier discontinued the line' : null,
    discardedByUserId: null,
    discardedAt: null,
    createdAt,
    updatedAt: createdAt,
  });
  return id;
};

// Models the Arrival Confirmation closure route, so AC-21a's "whichever way it closed" is exercised
// by both routes.
const seedPurchaseDraftClosedByArrival = async (
  warehouseId: string,
  createdByUserId: string,
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id,
    warehouseId,
    state: 'closed',
    expectedArrivalDate: null,
    createdByUserId,
    readiedByUserId: createdByUserId,
    readiedAt: now,
    arrivalConfirmedByUserId: createdByUserId,
    arrivalConfirmedAt: now,
    closedByUserId: createdByUserId,
    closedAt: now,
    closureReason: null,
    discardedByUserId: null,
    discardedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

const seedPurchaseDraftLine = async (
  purchaseDraftId: string,
  warehouseId: string,
  itemId: string,
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
  statedQuantity: number,
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftLineLinkEntity).insert({
    id,
    purchaseDraftLineId,
    purchaseDraftId,
    warehouseId,
    customerOrderId,
    statedQuantity,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

const seedSnapshot = async (
  linkId: string,
  lineId: string,
  customerOrderId: string,
  capturedQuantity: number,
  capturedNeededBy: string,
  capturedState: string,
): Promise<void> => {
  await dataSource.manager.getRepository(DemandSnapshotEntryEntity).insert({
    purchaseDraftLineLinkId: linkId,
    purchaseDraftLineId: lineId,
    customerOrderId,
    capturedQuantity,
    capturedNeededBy,
    capturedState,
    createdAt: now,
  });
};

const seedAllocation = async (
  linkId: string,
  lineId: string,
  customerOrderId: string,
  allocatedQuantity: number,
  allocatedByUserId: string,
): Promise<void> => {
  await dataSource.manager.getRepository(ArrivalAllocationEntity).insert({
    purchaseDraftLineLinkId: linkId,
    purchaseDraftLineId: lineId,
    customerOrderId,
    allocatedQuantity,
    allocatedByUserId,
    createdAt: now,
  });
};

const findLink = (
  detail: DraftDetailRead | null,
  linkId: string,
): LinkDemandRead | undefined =>
  detail?.lines
    .flatMap((line) => line.links)
    .find((link) => link.id === linkId);

interface DriftScenarioFixture {
  readonly warehouseId: string;
  readonly draftId: string;
  readonly userId: string;
  readonly seedScenario: (
    overrides: Parameters<typeof seedCustomerOrder>[3],
  ) => Promise<string>;
}

// Shared setup for every AC-16 scenario below: one draft with one line, and a helper that seeds a
// (Customer Order, link, snapshot) triple against it. Every snapshot captures the same baseline
// (quantity 10, needed-by 2026-09-30, unfulfilled) so each scenario's `overrides` is exactly what
// differs from that baseline.
const buildDriftScenarioFixture = async (): Promise<DriftScenarioFixture> => {
  const workspaceId = await seedWorkspace();
  const warehouseId = await seedWarehouse(workspaceId);
  const userId = await seedUser(workspaceId);
  const item = await seedItem(warehouseId);
  const draftId = await seedPurchaseDraft(
    warehouseId,
    userId,
    'ready_for_ordering',
  );
  const lineId = await seedPurchaseDraftLine(draftId, warehouseId, item.id);

  const seedScenario = async (
    overrides: Parameters<typeof seedCustomerOrder>[3],
  ): Promise<string> => {
    const orderId = await seedCustomerOrder(
      warehouseId,
      item.id,
      userId,
      overrides,
    );
    const linkId = await seedLink(lineId, draftId, warehouseId, orderId, 10);
    await seedSnapshot(
      linkId,
      lineId,
      orderId,
      10,
      '2026-09-30',
      'unfulfilled',
    );
    return linkId;
  };

  return { warehouseId, draftId, userId, seedScenario };
};

const registerReadDraftDriftDataTests = (): void => {
  // AC-16 — the read hands back, per link, the Demand Snapshot beside the Customer Order as it
  // stands now, in one query, so the use case above can name what changed. This is a data-shape and
  // round-trip proof; the categorized Drift Signal name is derived above the repository
  // (`read-purchase-draft.query.spec.ts`).
  it('reads the frozen contents plus, per link, the snapshot and the current Customer Order values, in one query', async () => {
    const { warehouseId, draftId, userId, seedScenario } =
      await buildDriftScenarioFixture();

    const cancelledLinkId = await seedScenario({
      quantity: 10,
      outstandingQuantity: 10,
      neededBy: '2026-09-30',
      state: 'cancelled',
      cancellationReason: 'Customer changed their mind',
      cancelledByUserId: userId,
      cancelledAt: movedAt,
      updatedAt: movedAt,
    });
    const requantifiedLinkId = await seedScenario({
      quantity: 25, // captured at 10, now 25
      outstandingQuantity: 25,
      neededBy: '2026-09-30',
      updatedAt: movedAt,
    });
    const rescheduledLinkId = await seedScenario({
      quantity: 10,
      outstandingQuantity: 10,
      neededBy: '2026-10-20', // captured at 2026-09-30
    });

    const { result: detail, queryCount } = await withQueryCount(() =>
      repository.readIdentifiedDraft(draftId, warehouseId),
    );

    expect(queryCount).toBe(1);
    expect(detail).not.toBeNull();

    const cancelledLink = findLink(detail, cancelledLinkId);
    expect(cancelledLink?.snapshot).toEqual({
      capturedQuantity: 10,
      capturedNeededBy: '2026-09-30',
      capturedState: 'unfulfilled',
      // T18/AC-18 — the captured Delivery Address, both `null` here because these scenarios seed
      // Customer Orders recorded by **typed name**, which name no address at all (AC-11a). The
      // Address Drift scenarios live in
      // `purchase-draft-address-drift-read.repository.integration.spec.ts`.
      capturedDeliveryAddressId: null,
      capturedDeliveryAddressText: null,
    });
    // AC-16 — `lastChangedAt` is what dates the drift statement the frame draws ("Cancelled on
    // 24 Aug", `F0SpRx.png`). It travels as UTC ISO 8601 with a `Z`, not with the session's own
    // offset, because `z.string().datetime()` admits nothing else.
    expect(cancelledLink?.current).toEqual({
      quantity: 10,
      neededBy: '2026-09-30',
      state: 'cancelled',
      outstandingQuantity: 10,
      lastChangedAt: '2026-08-28T09:15:00.000Z',
      deliveryAddress: null,
    });

    const requantifiedLink = findLink(detail, requantifiedLinkId);
    expect(requantifiedLink?.current.quantity).toBe(25);
    expect(requantifiedLink?.snapshot?.capturedQuantity).toBe(10);
    expect(requantifiedLink?.current.lastChangedAt).toBe(
      '2026-08-28T09:15:00.000Z',
    );

    const rescheduledLink = findLink(detail, rescheduledLinkId);
    expect(rescheduledLink?.current.neededBy).toBe('2026-10-20');
    expect(rescheduledLink?.snapshot?.capturedNeededBy).toBe('2026-09-30');
    // The needed-by scenario seeds no `updatedAt`, so the row still stands as it was recorded and
    // has no moment to report — the read must not offer the creation time as one.
    expect(rescheduledLink?.current.lastChangedAt).toBeNull();
  });

  // R1 (review-2026-09-04 finding 19) — `received_quantity` is dropped from the schema by
  // `DropReceivedQuantity1786700300000`, and `ending.quantity` is the one figure the contract still
  // serves for what arrived (openapi.yaml `PurchaseDraftLineIdentified`, `PurchaseDraftLineRedacted`,
  // both `additionalProperties: false` and neither naming `receivedQuantity`).
  it('does not carry receivedQuantity on the read line', async () => {
    const { warehouseId, draftId } = await buildDriftScenarioFixture();

    const detail = await repository.readIdentifiedDraft(draftId, warehouseId);

    expect(detail?.lines[0]).not.toHaveProperty('receivedQuantity');
  });

  // AC-16 — became Fulfilled through the arrival of a different draft, and the amended-then-put-
  // back-as-it-was case, which must report the exact same values as the snapshot rather than a
  // touch log of the intermediate amendment.
  it('reads a link that became Fulfilled and a link amended then put back as it was, each with matching current/snapshot values', async () => {
    const { warehouseId, draftId, seedScenario } =
      await buildDriftScenarioFixture();

    const fulfilledLinkId = await seedScenario({
      quantity: 10,
      outstandingQuantity: 0,
      neededBy: '2026-09-30',
      state: 'fulfilled',
    });
    const revertedLinkId = await seedScenario({
      quantity: 10, // amended to 99 and back to 10 — reports no drift
      outstandingQuantity: 10,
      neededBy: '2026-09-30',
    });

    const detail = await repository.readIdentifiedDraft(draftId, warehouseId);

    const fulfilledLink = findLink(detail, fulfilledLinkId);
    expect(fulfilledLink?.current.state).toBe('fulfilled');
    expect(fulfilledLink?.snapshot?.capturedState).toBe('unfulfilled');

    // Current equals the snapshot exactly, on every compared field — the data shape a "no drift"
    // derivation reads from.
    const revertedLink = findLink(detail, revertedLinkId);
    expect(revertedLink?.current.quantity).toBe(
      revertedLink?.snapshot?.capturedQuantity,
    );
    expect(revertedLink?.current.neededBy).toBe(
      revertedLink?.snapshot?.capturedNeededBy,
    );
    expect(revertedLink?.current.state).toBe(
      revertedLink?.snapshot?.capturedState,
    );
  });
};

const registerNoWriteTests = (): void => {
  // sad.md §6.8 step 4 / the freeze note "no step of this flow writes anything" — reading a draft
  // must not touch a single frozen value, the snapshot, or the linked Customer Order.
  it('alters no frozen value of the draft, its lines, its links, its snapshot, or the linked Customer Orders', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const item = await seedItem(warehouseId);

    const orderId = await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 40, // drifted from the captured 10, so the read has something to compare
      outstandingQuantity: 40,
      neededBy: '2026-11-01',
    });
    const draftId = await seedPurchaseDraft(
      warehouseId,
      userId,
      'ready_for_ordering',
    );
    const lineId = await seedPurchaseDraftLine(draftId, warehouseId, item.id);
    const linkId = await seedLink(lineId, draftId, warehouseId, orderId, 10);
    await seedSnapshot(
      linkId,
      lineId,
      orderId,
      10,
      '2026-09-30',
      'unfulfilled',
    );

    const before = {
      draft: await dataSource.manager
        .getRepository(PurchaseDraftEntity)
        .findOneOrFail({ where: { id: draftId } }),
      line: await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .findOneOrFail({ where: { id: lineId } }),
      link: await dataSource.manager
        .getRepository(PurchaseDraftLineLinkEntity)
        .findOneOrFail({ where: { id: linkId } }),
      snapshot: await dataSource.manager
        .getRepository(DemandSnapshotEntryEntity)
        .findOneOrFail({ where: { purchaseDraftLineLinkId: linkId } }),
      order: await dataSource.manager
        .getRepository(CustomerOrderEntity)
        .findOneOrFail({ where: { id: orderId } }),
    };

    await repository.readIdentifiedDraft(draftId, warehouseId);
    await repository.listDrafts(warehouseId);

    const after = {
      draft: await dataSource.manager
        .getRepository(PurchaseDraftEntity)
        .findOneOrFail({ where: { id: draftId } }),
      line: await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .findOneOrFail({ where: { id: lineId } }),
      link: await dataSource.manager
        .getRepository(PurchaseDraftLineLinkEntity)
        .findOneOrFail({ where: { id: linkId } }),
      snapshot: await dataSource.manager
        .getRepository(DemandSnapshotEntryEntity)
        .findOneOrFail({ where: { purchaseDraftLineLinkId: linkId } }),
      order: await dataSource.manager
        .getRepository(CustomerOrderEntity)
        .findOneOrFail({ where: { id: orderId } }),
    };

    expect(after).toEqual(before);
  });
};

const registerClosedDraftReadableTests = (): void => {
  // AC-21a — a Closed draft, whichever route closed it, stays readable as the record of what was
  // ordered and what arrived: its lines, its links, its received quantities and its Allocations are
  // all still returned exactly as an open draft's are.
  it('keeps a Closed draft readable with its lines, received quantities and Allocations, whichever route closed it', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const item = await seedItem(warehouseId);

    const order = await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 10,
      outstandingQuantity: 0,
      state: 'fulfilled',
    });

    const closedByReason = await seedPurchaseDraft(
      warehouseId,
      userId,
      'closed',
    );
    const closedByReasonLine = await seedPurchaseDraftLine(
      closedByReason,
      warehouseId,
      item.id,
    );
    const closedByReasonLinkId = await seedLink(
      closedByReasonLine,
      closedByReason,
      warehouseId,
      order,
      10,
    );
    await seedSnapshot(
      closedByReasonLinkId,
      closedByReasonLine,
      order,
      10,
      '2026-09-30',
      'unfulfilled',
    );

    const closedByArrival = await seedPurchaseDraftClosedByArrival(
      warehouseId,
      userId,
    );
    const closedByArrivalLine = await seedPurchaseDraftLine(
      closedByArrival,
      warehouseId,
      item.id,
    );
    const closedByArrivalLinkId = await seedLink(
      closedByArrivalLine,
      closedByArrival,
      warehouseId,
      order,
      10,
    );
    await seedSnapshot(
      closedByArrivalLinkId,
      closedByArrivalLine,
      order,
      10,
      '2026-09-30',
      'unfulfilled',
    );
    await seedAllocation(
      closedByArrivalLinkId,
      closedByArrivalLine,
      order,
      10,
      userId,
    );

    const reasonDetail = await repository.readIdentifiedDraft(
      closedByReason,
      warehouseId,
    );
    expect(reasonDetail?.state).toBe('closed');
    expect(reasonDetail?.closureReason).toBe('Supplier discontinued the line');
    expect(reasonDetail?.lines).toHaveLength(1);
    // The shared Customer Order became Fulfilled through the *other* draft's arrival, not this
    // one's own — this draft holds no Allocation for it, so this is genuine drift (AC-16).
    expect(reasonDetail?.hasDriftSignal).toBe(true);

    const arrivalDetail = await repository.readIdentifiedDraft(
      closedByArrival,
      warehouseId,
    );
    expect(arrivalDetail?.state).toBe('closed');
    expect(arrivalDetail?.closureReason).toBeNull();
    expect(arrivalDetail?.arrivalConfirmedByUserId).toBe(userId);
    expect(arrivalDetail?.lines).toHaveLength(1);
    const allocatedLink = findLink(arrivalDetail, closedByArrivalLinkId);
    expect(allocatedLink?.allocation).toEqual(
      expect.objectContaining({
        allocatedQuantity: 10,
        allocatedByUserId: userId,
      }),
    );
    // This draft's own Arrival Confirmation is what fulfilled the order — the Allocation it holds
    // is the discriminator that tells this apart from a different draft's arrival, so it must
    // never itself report a "became_fulfilled" Drift Signal (AC-16, openapi.yaml `DriftSignalKind`).
    expect(arrivalDetail?.hasDriftSignal).toBe(false);
  });
};

const registerListHasDriftSignalTests = (): void => {
  // AC-16a — the drafts list distinguishes drafts carrying a Drift Signal from those still
  // matching their demand.
  it('distinguishes drafts whose snapshot rows differ from their current demand from those that still match, on the list', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const item = await seedItem(warehouseId);

    const matchingOrder = await seedCustomerOrder(
      warehouseId,
      item.id,
      userId,
      {
        quantity: 10,
        outstandingQuantity: 10,
        neededBy: '2026-09-30',
      },
    );
    const matchingDraft = await seedPurchaseDraft(
      warehouseId,
      userId,
      'ready_for_ordering',
    );
    const matchingLine = await seedPurchaseDraftLine(
      matchingDraft,
      warehouseId,
      item.id,
    );
    const matchingLinkId = await seedLink(
      matchingLine,
      matchingDraft,
      warehouseId,
      matchingOrder,
      10,
    );
    await seedSnapshot(
      matchingLinkId,
      matchingLine,
      matchingOrder,
      10,
      '2026-09-30',
      'unfulfilled',
    );

    const driftedOrder = await seedCustomerOrder(warehouseId, item.id, userId, {
      quantity: 10,
      outstandingQuantity: 10,
      neededBy: '2026-09-30',
      state: 'cancelled',
      cancellationReason: 'Supplier shortage',
      cancelledByUserId: userId,
      cancelledAt: now,
    });
    const driftedDraft = await seedPurchaseDraft(
      warehouseId,
      userId,
      'ready_for_ordering',
    );
    const driftedLine = await seedPurchaseDraftLine(
      driftedDraft,
      warehouseId,
      item.id,
    );
    const driftedLinkId = await seedLink(
      driftedLine,
      driftedDraft,
      warehouseId,
      driftedOrder,
      10,
    );
    await seedSnapshot(
      driftedLinkId,
      driftedLine,
      driftedOrder,
      10,
      '2026-09-30',
      'unfulfilled',
    );

    // A never-frozen draft carries no snapshot at all and must never report drift.
    const neverFrozenDraft = await seedPurchaseDraft(
      warehouseId,
      userId,
      'draft',
    );

    const { result: rows, queryCount } = await withQueryCount(() =>
      repository.listDrafts(warehouseId),
    );

    expect(queryCount).toBe(1);

    const matchingRow = rows.find((row) => row.id === matchingDraft);
    const driftedRow = rows.find((row) => row.id === driftedDraft);
    const neverFrozenRow = rows.find((row) => row.id === neverFrozenDraft);

    expect(matchingRow?.hasDriftSignal).toBe(false);
    expect(driftedRow?.hasDriftSignal).toBe(true);
    expect(neverFrozenRow?.hasDriftSignal).toBe(false);
  });
};

const registerWarehouseScopingTests = (): void => {
  // Deleting the `warehouseId` predicate on either method would leave every other fixture in this
  // file green, because each one seeds a single Warehouse — a second Warehouse is required to
  // prove the scoping is real.
  it("reads null for a draft that belongs to a different Warehouse, and omits it from that Warehouse's list", async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);

    const otherWorkspaceId = await seedWorkspace();
    const otherWarehouseId = await seedWarehouse(otherWorkspaceId);
    const otherUserId = await seedUser(otherWorkspaceId);
    const otherDraftId = await seedPurchaseDraft(
      otherWarehouseId,
      otherUserId,
      'draft',
    );

    const detail = await repository.readIdentifiedDraft(
      otherDraftId,
      warehouseId,
    );
    expect(detail).toBeNull();

    const ownDraftId = await seedPurchaseDraft(warehouseId, userId, 'draft');
    const rows = await repository.listDrafts(warehouseId);

    expect(rows.map((row) => row.id)).toEqual([ownDraftId]);
    expect(rows.some((row) => row.id === otherDraftId)).toBe(false);
  });
};

const registerNonFanOutTests = (): void => {
  // sad.md/data-model.md "the non-fan-out requirement" — a draft with more than one line, each
  // with more than one link, must never multiply a row: `lines.length`/`lineCount` and each
  // line's own `links.length` prove it directly rather than trusting the SQL shape by inspection
  // alone.
  it('reads every line and every link of a multi-line, multi-link draft without fan-out', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const itemOne = await seedItem(warehouseId);
    const itemTwo = await seedItem(warehouseId);
    const draftId = await seedPurchaseDraft(
      warehouseId,
      userId,
      'ready_for_ordering',
    );

    const lineOneId = await seedPurchaseDraftLine(
      draftId,
      warehouseId,
      itemOne.id,
    );
    const lineTwoId = await seedPurchaseDraftLine(
      draftId,
      warehouseId,
      itemTwo.id,
    );

    for (const [lineId, item] of [
      [lineOneId, itemOne],
      [lineTwoId, itemTwo],
    ] as const) {
      for (let linkIndex = 0; linkIndex < 2; linkIndex += 1) {
        const orderId = await seedCustomerOrder(warehouseId, item.id, userId, {
          quantity: 5,
          outstandingQuantity: 5,
        });
        const linkId = await seedLink(lineId, draftId, warehouseId, orderId, 5);
        await seedSnapshot(
          linkId,
          lineId,
          orderId,
          5,
          '2026-09-30',
          'unfulfilled',
        );
      }
    }

    const detail = await repository.readIdentifiedDraft(draftId, warehouseId);

    expect(detail?.lineCount).toBe(2);
    expect(detail?.lines).toHaveLength(2);
    for (const line of detail?.lines ?? []) {
      expect(line.links).toHaveLength(2);
    }
  });
};

const registerListStateFilterAndOrderingTests = (): void => {
  // openapi.yaml — the `state` query parameter narrows the list to one state, and drafts are
  // ordered by creation time descending. Every other fixture in this file shares `now`, so a
  // fixed ordering bug would still pass; distinct `createdAt` values are required to prove it.
  it('narrows the list to the requested state and orders the result by creation time descending', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);

    const earlier = new Date('2026-08-01T09:00:00.000Z');
    const later = new Date('2026-08-20T09:00:00.000Z');

    const olderDraftDraft = await seedPurchaseDraft(
      warehouseId,
      userId,
      'draft',
      earlier,
    );
    const newerReadyDraft = await seedPurchaseDraft(
      warehouseId,
      userId,
      'ready_for_ordering',
      later,
    );

    const draftStateRows = await repository.listDrafts(warehouseId, 'draft');
    expect(draftStateRows.map((row) => row.id)).toEqual([olderDraftDraft]);

    const allRows = await repository.listDrafts(warehouseId);
    expect(allRows.map((row) => row.id)).toEqual([
      newerReadyDraft,
      olderDraftDraft,
    ]);
  });
};

// Flips `process.env.TZ` around a read. Under node-postgres this is what reproduces the failure —
// its `date` parser builds a JS `Date` at local midnight, so the offset decides which calendar day
// comes back. These tests run on PGlite, whose JS-side parser does not do that, so the flip is
// documentation of the production hazard rather than a reproduction of it here.
const withTimeZone = async <T>(
  timeZone: string,
  run: () => Promise<T>,
): Promise<T> => {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return await run();
  } finally {
    process.env.TZ = previous;
  }
};

const registerExpectedArrivalDateTests = (): void => {
  // AC-10 / openapi.yaml `expectedArrivalDate` — a calendar day, never an instant. Both reads here
  // project the column through a raw query, which bypasses the entity's `@Column('date')` mapping,
  // so without the SQL cast the driver decodes it into a JS `Date`: against node-postgres that is
  // midnight in the server's own timezone, and at UTC+2 `2026-09-25` leaves the API as
  // `"2026-09-24T22:00:00.000Z"` — the wrong calendar day *and* the wrong shape, which
  // `purchaseDraftSummarySchema`'s `z.string().date()` refuses. Because the list endpoint validates
  // the whole array, one such draft blanks the entire screen.
  //
  // What this test actually pins is the *shape*: `typeof === 'string'`, on both reads. It runs on
  // PGlite, whose JS-side `date` parser does not construct a local-midnight `Date` the way
  // node-postgres does, so it cannot demonstrate the timezone half of the failure and does not
  // claim to. The `withTimeZone` wrapper is there so the assertion holds under a non-UTC offset
  // too, not as evidence that the offset is what would have broken it.
  it('reads the Expected Arrival Date as the stored calendar day on both reads, as a string', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);

    const datedDraftId = await seedPurchaseDraft(
      warehouseId,
      userId,
      'draft',
      now,
      '2026-09-25',
    );

    const { rows, detail } = await withTimeZone('Europe/Kyiv', async () => ({
      rows: await repository.listDrafts(warehouseId),
      detail: await repository.readIdentifiedDraft(datedDraftId, warehouseId),
    }));

    const datedRow = rows.find((row) => row.id === datedDraftId);

    expect(typeof datedRow?.expectedArrivalDate).toBe('string');
    expect(datedRow?.expectedArrivalDate).toBe('2026-09-25');
    expect(typeof detail?.expectedArrivalDate).toBe('string');
    expect(detail?.expectedArrivalDate).toBe('2026-09-25');
  });

  // Left unstated while the member has not yet spoken to the supplier (AC-10): the cast must not
  // turn a missing date into a string.
  it('leaves an unstated Expected Arrival Date null on both reads', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);
    const undatedDraftId = await seedPurchaseDraft(
      warehouseId,
      userId,
      'draft',
    );

    const rows = await repository.listDrafts(warehouseId);
    const detail = await repository.readIdentifiedDraft(
      undatedDraftId,
      warehouseId,
    );

    expect(rows[0]?.expectedArrivalDate).toBeNull();
    expect(detail?.expectedArrivalDate).toBeNull();
  });
};

const registerReferenceTests = (): void => {
  // The design frames name every draft `PD-0143` on its list card and in its detail header
  // (`previews/yGhkK.png`), so both reads must carry the reference the database minted. Nothing
  // supplies it on insert — `purchase_drafts.reference` has a column DEFAULT over
  // `purchase_draft_reference_seq` (`1786600200000-AddPurchaseDraftReference.ts`) — so this also
  // proves the default is what produces it.
  it('reads the database-minted human reference on both reads, distinct per draft', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);

    const firstDraftId = await seedPurchaseDraft(warehouseId, userId, 'draft');
    const secondDraftId = await seedPurchaseDraft(warehouseId, userId, 'draft');

    const rows = await repository.listDrafts(warehouseId);
    const detail = await repository.readIdentifiedDraft(
      firstDraftId,
      warehouseId,
    );

    const firstReference = rows.find(
      (row) => row.id === firstDraftId,
    )?.reference;
    const secondReference = rows.find(
      (row) => row.id === secondDraftId,
    )?.reference;

    expect(firstReference).toMatch(/^PD-\d{4,}$/u);
    expect(secondReference).toMatch(/^PD-\d{4,}$/u);
    expect(firstReference).not.toBe(secondReference);
    expect(detail?.reference).toBe(firstReference);
  });
};

// Neither test below touches a Rejection, so this double never needs to resolve one.
const emptyRejectionReasonCatalogue = () => ({
  resolveRejectionReasons: vi.fn().mockResolvedValue([]),
});

const registerHasDriftSignalInvariantTests = (): void => {
  // The list's `hasDriftSignal` and the read's per-link `driftSignals` are two views of exactly
  // the same four named conditions (openapi.yaml `DriftSignalKind`); they must never disagree,
  // e.g. a Customer Order moving from Fulfilled back to Unfulfilled is not a named signal and
  // must not raise `hasDriftSignal` either.
  it('agrees with the derived per-link Drift Signals on whether the draft carries one', async () => {
    const { warehouseId, draftId, seedScenario } =
      await buildDriftScenarioFixture();
    await seedScenario({
      quantity: 10,
      outstandingQuantity: 10,
      neededBy: '2026-09-30',
      state: 'unfulfilled',
    });

    const detail = await repository.readIdentifiedDraft(draftId, warehouseId);
    expect(detail).not.toBeNull();

    const query = new ReadPurchaseDraftQuery(
      repository as never,
      new RejectionReasonLabelService(emptyRejectionReasonCatalogue() as never),
    );
    const derived = await query.execute(identifiedActor(warehouseId), draftId);

    const derivedHasDriftSignal = (derived?.lines ?? []).some((line) =>
      line.links.some((link) => link.driftSignals.length > 0),
    );

    expect(detail?.hasDriftSignal).toBe(derivedHasDriftSignal);
    expect(detail?.hasDriftSignal).toBe(false);
  });

  it('agrees with the derived per-link Drift Signals when the draft does carry one', async () => {
    const { warehouseId, draftId, seedScenario } =
      await buildDriftScenarioFixture();
    await seedScenario({
      quantity: 25,
      outstandingQuantity: 25,
      neededBy: '2026-09-30',
    });

    const detail = await repository.readIdentifiedDraft(draftId, warehouseId);
    expect(detail).not.toBeNull();

    const query = new ReadPurchaseDraftQuery(
      repository as never,
      new RejectionReasonLabelService(emptyRejectionReasonCatalogue() as never),
    );
    const derived = await query.execute(identifiedActor(warehouseId), draftId);

    const derivedHasDriftSignal = (derived?.lines ?? []).some((line) =>
      line.links.some((link) => link.driftSignals.length > 0),
    );

    expect(detail?.hasDriftSignal).toBe(derivedHasDriftSignal);
    expect(detail?.hasDriftSignal).toBe(true);
  });
};

describe('PurchaseDraftReadRepository', () => {
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

  registerReadDraftDriftDataTests();
  registerNoWriteTests();
  registerClosedDraftReadableTests();
  registerListHasDriftSignalTests();
  registerWarehouseScopingTests();
  registerNonFanOutTests();
  registerListStateFilterAndOrderingTests();
  registerExpectedArrivalDateTests();
  registerReferenceTests();
  registerHasDriftSignalInvariantTests();
});
