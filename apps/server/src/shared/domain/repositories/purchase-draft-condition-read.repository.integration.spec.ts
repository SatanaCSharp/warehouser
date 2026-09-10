import { randomUUID } from 'node:crypto';

// T6 — AC-21/AC-22/AC-23/AC-23a against `PurchaseDraftReadRepository`. Each line of a closed draft
// must carry its whole account: what was ordered, what the supplier presented, the derived Accepted
// and Rejected Quantities, its Pre-receipt Conformance, and each refused quantity beside its Reason
// identifier, description, Source and Disposition — all built **inside the correlated per-line
// aggregation the read already assembles**, never in a second query (sad.md §6.3, data-model.md
// § "Derived quantities: Accepted and Rejected", tasks/purchase-draft-read-repository-condition.md).
//
// A file of its own rather than more blocks on
// `purchase-draft-read.repository.integration.spec.ts`: that file already sits near the 1000-line
// budget, and these scenarios need the Rejection Reason catalogue and ended lines that none of its
// own do — the same reason `purchase-draft-address-drift-read.repository.integration.spec.ts`
// exists.
import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { DemandSnapshotEntryEntity } from 'shared/domain/entities/demand-snapshot-entry.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PackagingTypeEntity } from 'shared/domain/entities/packaging-type.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import type { PurchaseDraftLinePreReceiptConformance } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { PurchaseDraftLineRejectionEntity } from 'shared/domain/entities/purchase-draft-line-rejection.entity';
import { RejectionReasonEntity } from 'shared/domain/entities/rejection-reason.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { PurchaseDraftReadRepository } from 'shared/domain/repositories/purchase-draft-read.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
import type { Logger } from 'typeorm';
// `PostgresQueryRunner.prototype.query` is the one method every TypeORM access path ultimately
// calls to reach PostgreSQL. Spying on it proves actual round trips, so a second query fetching the
// Rejections still fails even though it returns identical figures — the idiom
// `consolidated-demand.repository.integration.spec.ts` (T10) establishes and
// `purchase-draft-address-drift-read.repository.integration.spec.ts` (T18) reuses.
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
// When the ending was recorded, and therefore when each Rejection on it was raised
// (`created_at` **is** the raising time — data-model.md §`purchase_draft_line_rejections`).
const endedAt = new Date('2026-09-18T10:30:00.000Z');
const ENDED_AT_ISO = '2026-09-18T10:30:00.000Z';
// A Disposition decided after closure (AC-18), which is what gives one Rejection an amendment and
// the other none.
const amendedAt = new Date('2026-09-19T14:05:00.000Z');
const AMENDED_AT_ISO = '2026-09-19T14:05:00.000Z';

const FROZEN_PACKAGING_TYPE_ID = 'cable_coil';
const VALUE_ADDING_NOTE = 'Label each coil with the customer reference';
const CONFORMANCE_NOTE =
  'Coils arrived uncoiled and unlabelled; the packaging was honoured, the labelling was not.';
const DAMAGE_DESCRIPTION = 'Outer coil crushed; two runs severed.';

// Catalogue rows added *after* the fixtures were recorded, which is what AC-23 and AC-23a read
// against. Deleted in `afterEach`, because neither catalogue is truncated between tests — both are
// migration-seeded reference data every test in this file depends on.
const LATER_PACKAGING_TYPE_ID = 'shrink_wrapped_pallets';
const LATER_REJECTION_REASON_ID = 'label_illegible';

// The shape this RED step expects the implementer to expose. `ending` gains the four derived and
// recorded members flat rather than a nested `condition` object: the discriminator between "no
// Condition Split was recorded" and "one was recorded and refused nothing" is the **conformance
// verdict's absence** (data-model.md § Derived quantities), and deciding what `condition: null`
// means in the response is T12's business decision above this repository
// (creating-a-server-repository.md "business decisions belong to the owning feature").
interface RejectionRead {
  readonly id: string;
  // The Reason is carried as its **identifier**; nothing copies the catalogue's wording, which is
  // what makes AC-23a hold by construction rather than by a frozen column.
  readonly rejectionReasonId: string;
  readonly quantity: number;
  readonly source: string;
  readonly description: string | null;
  readonly disposition: string;
  readonly raisedByUserId: string;
  readonly raisedAt: string;
  readonly amendedByUserId: string | null;
  readonly amendedAt: string | null;
}

// openapi.yaml `PreReceiptConformance`. `null` on a line where nothing was received (AC-04a) and on
// every ending recorded before this release (sad.md §7) — the two cases read alike by design.
interface PreReceiptConformanceRead {
  readonly verdict: string;
  readonly note: string | null;
}

interface ConditionEndingRead {
  readonly kind: string;
  readonly quantity: number;
  readonly recordedByUserId: string;
  readonly recordedAt: string;
  // Derived, never stored and never input: `ending_quantity − COALESCE(SUM(rejection.quantity), 0)`
  // and that sum, computed inside the same correlated aggregation (data-model.md, sad.md §7).
  readonly acceptedQuantity: number;
  readonly rejectedQuantity: number;
  readonly preReceiptConformance: PreReceiptConformanceRead | null;
  readonly rejections: readonly RejectionRead[];
}

interface ConditionLineRead {
  readonly id: string;
  readonly orderedQuantity: number;
  readonly packagingTypeId: string | null;
  readonly valueAddingNote: string | null;
  readonly ending: ConditionEndingRead | null;
  readonly links: readonly { readonly id: string }[];
}

interface ConditionDraftRead {
  readonly id: string;
  readonly lines: readonly ConditionLineRead[];
}

interface ConditionLineEntryRead {
  readonly purchaseDraftId: string;
  readonly line: ConditionLineRead;
}

// Cast through this interface because the condition members above do not exist on the shipped read
// types yet — the same idiom `purchase-draft-read.repository.integration.spec.ts` used while its own
// repository was still to be written.
// AC-22/sad.md §6.3 — the second, independent narrowing. `cause_withheld` must issue a query that
// does not select the Rejection cause columns **at all**, so the shape it returns carries no
// `rejections` property to delete.
type CauseProjection = 'with_cause' | 'cause_withheld';

// Every parameter is required here, mirroring the repository exactly. An optional `cause` let this
// suite call the real methods with two arguments — legal against this narrowed contract, invisible to
// `tsc` behind the cast below, and silently answered by a default the repository no longer has
// (code-review-back-end-2026-09-09.md).
interface PurchaseDraftConditionReadContract {
  readIdentifiedDraft(
    purchaseDraftId: string,
    warehouseId: string,
    cause: CauseProjection,
  ): Promise<ConditionDraftRead | null>;
  readRedactedDraft(
    purchaseDraftId: string,
    warehouseId: string,
    cause: CauseProjection,
  ): Promise<ConditionDraftRead | null>;
  listIdentifiedLines(
    warehouseId: string,
    filters: Record<string, never>,
    cause: CauseProjection,
  ): Promise<ConditionLineEntryRead[]>;
  listRedactedLines(
    warehouseId: string,
    filters: Record<string, never>,
    cause: CauseProjection,
  ): Promise<ConditionLineEntryRead[]>;
}

const repository = new PurchaseDraftReadRepository(
  dataSource,
) as unknown as PurchaseDraftConditionReadContract;

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

// Captures every SQL statement TypeORM sends while installed, so the EXPLAIN test re-plans the
// exact statement the repository issued rather than a hand-reconstructed approximation of it — the
// idiom `workspace-read.repository.integration.spec.ts` establishes.
class CapturingLogger implements Logger {
  readonly statements: { sql: string; parameters: unknown[] }[] = [];
  logQuery(query: string, parameters?: unknown[]): void {
    this.statements.push({ sql: query, parameters: parameters ?? [] });
  }
  logQueryError(): void {}
  logQuerySlow(): void {}
  logSchemaBuild(): void {}
  logMigration(): void {}
  log(): void {}
}

// Runs `subject`, then re-`EXPLAIN`s the last statement it issued with `enable_seqscan` forced off,
// so a plan that legitimately does not qualify for the target index still reports a Seq Scan
// instead of being masked by fixture-scale cost preference.
// The last statement `subject` sent, as it was sent. Both the EXPLAIN test and the withheld-shape
// test read the *issued* SQL rather than a hand-reconstructed approximation of it, which is what
// makes "the withheld query does not name these columns" a fact about the query rather than about
// the projection someone believes it builds.
const lastStatementOf = async (
  subject: () => Promise<unknown>,
): Promise<{ sql: string; parameters: unknown[] }> => {
  const originalLogger = dataSource.logger;
  const logger = new CapturingLogger();
  dataSource.logger = logger;
  await subject();
  dataSource.logger = originalLogger;

  const last = logger.statements.at(-1);
  if (!last) {
    throw new Error('no SQL statement was captured');
  }

  return last;
};

const explainLastQuery = async (
  subject: () => Promise<unknown>,
): Promise<string> => {
  const last = await lastStatementOf(subject);

  const rows = await dataSource.transaction(async (manager) => {
    await manager.query('SET LOCAL enable_seqscan = off');
    return manager.query<Record<string, string>[]>(
      `EXPLAIN ${last.sql}`,
      last.parameters,
    );
  });
  return rows.map((row) => Object.values(row)[0]).join('\n');
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

// Closed by its own Arrival Confirmation, which is the state AC-21 reads: the draft has been closed
// and every line's ending is recorded.
const seedClosedPurchaseDraft = async (
  warehouseId: string,
  userId: string,
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id,
    warehouseId,
    state: 'closed',
    expectedArrivalDate: null,
    createdByUserId: userId,
    readiedByUserId: userId,
    readiedAt: now,
    arrivalConfirmedByUserId: userId,
    arrivalConfirmedAt: endedAt,
    closedByUserId: userId,
    closedAt: endedAt,
    closureReason: null,
    discardedByUserId: null,
    discardedAt: null,
    createdAt: now,
    updatedAt: endedAt,
  });
  return id;
};

interface EndedLineOptions {
  readonly orderedQuantity: number;
  readonly endingQuantity: number;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
  // `null` is the **absent case**: a line whose ending predates this release was left untouched and
  // was never backfilled (spec.md §8 tenth question, sad.md §7).
  readonly preReceiptConformance?: PurchaseDraftLinePreReceiptConformance | null;
  readonly preReceiptConformanceNote?: string | null;
}

const seedEndedLine = async (
  purchaseDraftId: string,
  warehouseId: string,
  itemId: string,
  userId: string,
  options: EndedLineOptions,
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
    id,
    purchaseDraftId,
    warehouseId,
    itemId,
    orderedQuantity: options.orderedQuantity,
    packagingTypeId: options.packagingTypeId ?? null,
    valueAddingNote: options.valueAddingNote ?? null,
    deliveryMode: 'via_warehouse',
    customerDeliveryAddressId: null,
    frozenDeliveryAddressText: null,
    frozenAccessNotes: null,
    frozenCustomerName: null,
    endingQuantity: options.endingQuantity,
    endingKind: 'arrival',
    endingRecordedByUserId: userId,
    endingRecordedAt: endedAt,
    preReceiptConformance: options.preReceiptConformance ?? null,
    preReceiptConformanceNote: options.preReceiptConformanceNote ?? null,
    createdAt: now,
    updatedAt: endedAt,
  });
  return id;
};

interface RejectionOptions {
  readonly rejectionReasonId: string;
  readonly quantity: number;
  readonly description?: string | null;
  readonly disposition?: string;
  readonly amended?: boolean;
}

const seedRejection = async (
  lineId: string,
  warehouseId: string,
  userId: string,
  options: RejectionOptions,
): Promise<string> => {
  const id = randomUUID();
  await dataSource.manager
    .getRepository(PurchaseDraftLineRejectionEntity)
    .insert({
      id,
      purchaseDraftLineId: lineId,
      warehouseId,
      // AC-25 — `chk_purchase_draft_line_rejections_source_matches_mode` pairs Inspected with
      // `via_warehouse`, which is the mode every line in this file carries.
      deliveryMode: 'via_warehouse',
      rejectionReasonId: options.rejectionReasonId,
      quantity: options.quantity,
      source: 'inspected',
      description: options.description ?? null,
      disposition:
        (options.disposition as 'undecided' | undefined) ?? 'undecided',
      raisedByUserId: userId,
      amendedByUserId: options.amended === true ? userId : null,
      amendedAt: options.amended === true ? amendedAt : null,
      createdAt: endedAt,
      updatedAt: options.amended === true ? amendedAt : endedAt,
    });
  return id;
};

interface ConditionFixture {
  readonly warehouseId: string;
  readonly userId: string;
  readonly itemId: string;
  readonly draftId: string;
  // Presented 100, refused 8 across two Reasons, judged Not met against its frozen instruction.
  readonly refusedLineId: string;
  // Presented 20 and refused nothing: a Condition Split that refused nothing, **not** the absence
  // of one.
  readonly cleanLineId: string;
  // An ending recorded before this release: never backfilled, so it carries neither a Condition
  // Split nor a Pre-receipt Conformance.
  readonly preReleaseLineId: string;
}

// One closed draft holding the three cases AC-21 and sad.md §7 name, so one read exercises all
// three and the per-line aggregation cannot pass by returning one line's figures for every line.
const buildConditionFixture = async (): Promise<ConditionFixture> => {
  const workspaceId = await seedWorkspace();
  const warehouseId = await seedWarehouse(workspaceId);
  const userId = await seedUser(workspaceId);
  const itemId = await seedItem(warehouseId);
  const draftId = await seedClosedPurchaseDraft(warehouseId, userId);

  const refusedLineId = await seedEndedLine(
    draftId,
    warehouseId,
    itemId,
    userId,
    {
      orderedQuantity: 140,
      endingQuantity: 100,
      packagingTypeId: FROZEN_PACKAGING_TYPE_ID,
      valueAddingNote: VALUE_ADDING_NOTE,
      preReceiptConformance: 'not_met',
      preReceiptConformanceNote: CONFORMANCE_NOTE,
    },
  );
  await seedRejection(refusedLineId, warehouseId, userId, {
    rejectionReasonId: 'damaged_in_transit',
    quantity: 5,
    description: DAMAGE_DESCRIPTION,
    disposition: 'held_for_return',
    amended: true,
  });
  await seedRejection(refusedLineId, warehouseId, userId, {
    rejectionReasonId: 'value_adding_note_not_applied',
    quantity: 3,
  });

  const cleanLineId = await seedEndedLine(
    draftId,
    warehouseId,
    itemId,
    userId,
    {
      orderedQuantity: 20,
      endingQuantity: 20,
      packagingTypeId: 'cartons',
      preReceiptConformance: 'met',
    },
  );

  const preReleaseLineId = await seedEndedLine(
    draftId,
    warehouseId,
    itemId,
    userId,
    { orderedQuantity: 50, endingQuantity: 40 },
  );

  return {
    warehouseId,
    userId,
    itemId,
    draftId,
    refusedLineId,
    cleanLineId,
    preReleaseLineId,
  };
};

const findLine = (
  detail: ConditionDraftRead | null,
  lineId: string,
): ConditionLineRead | undefined =>
  detail?.lines.find((line) => line.id === lineId);

const findEntryLine = (
  entries: ConditionLineEntryRead[],
  lineId: string,
): ConditionLineRead | undefined =>
  entries.map((entry) => entry.line).find((line) => line.id === lineId);

// The whole account of the refused line, as both reads must build it (AC-21). Written once so the
// opened draft and the by-line read can never be proved to different standards — the same reason
// `lineJsonObject` is written once in the repository.
const expectRefusedLineAccount = (
  line: ConditionLineRead | undefined,
): void => {
  expect(line?.orderedQuantity).toBe(140);
  expect(line?.ending?.quantity).toBe(100);
  // Derived: 100 − (5 + 3), and the sum itself. Neither is a column and neither is ever input
  // (sad.md §7, data-model.md § Derived quantities).
  expect(line?.ending?.acceptedQuantity).toBe(92);
  expect(line?.ending?.rejectedQuantity).toBe(8);
  expect(line?.ending?.preReceiptConformance).toEqual({
    verdict: 'not_met',
    note: CONFORMANCE_NOTE,
  });
  // Each refused quantity beside its Reason identifier, description, Source and Disposition,
  // ordered by Reason identifier (openapi.yaml `LineConditionWithCause.rejections`).
  expect(
    line?.ending?.rejections.map((rejection) => ({
      rejectionReasonId: rejection.rejectionReasonId,
      quantity: rejection.quantity,
      source: rejection.source,
      description: rejection.description,
      disposition: rejection.disposition,
      raisedByUserId: rejection.raisedByUserId,
      raisedAt: rejection.raisedAt,
      amendedAt: rejection.amendedAt,
    })),
  ).toEqual([
    {
      rejectionReasonId: 'damaged_in_transit',
      quantity: 5,
      source: 'inspected',
      description: DAMAGE_DESCRIPTION,
      disposition: 'held_for_return',
      raisedByUserId: line?.ending?.recordedByUserId,
      raisedAt: ENDED_AT_ISO,
      amendedAt: AMENDED_AT_ISO,
    },
    {
      rejectionReasonId: 'value_adding_note_not_applied',
      quantity: 3,
      source: 'inspected',
      description: null,
      disposition: 'undecided',
      raisedByUserId: line?.ending?.recordedByUserId,
      raisedAt: ENDED_AT_ISO,
      amendedAt: null,
    },
  ]);
};

// A Condition Split that refused nothing — distinguished from the absent case below by the
// conformance verdict being present, never by the empty Rejections both share.
const expectCleanLineAccount = (line: ConditionLineRead | undefined): void => {
  expect(line?.ending?.quantity).toBe(20);
  expect(line?.ending?.acceptedQuantity).toBe(20);
  expect(line?.ending?.rejectedQuantity).toBe(0);
  expect(line?.ending?.preReceiptConformance).toEqual({
    verdict: 'met',
    note: null,
  });
  expect(line?.ending?.rejections).toEqual([]);
};

// The absent case spec.md §5 never describes: an ending recorded before this release carries no
// conformance and no Rejections, and its Accepted Quantity is its Received Quantity — which the
// derivation gives for free, with no branch (data-model.md § Derived quantities, sad.md §7).
const expectPreReleaseLineAccount = (
  line: ConditionLineRead | undefined,
): void => {
  expect(line?.ending?.quantity).toBe(40);
  expect(line?.ending?.preReceiptConformance).toBeNull();
  expect(line?.ending?.rejections).toEqual([]);
  expect(line?.ending?.rejectedQuantity).toBe(0);
  expect(line?.ending?.acceptedQuantity).toBe(40);
  expect(line?.ending?.acceptedQuantity).toBe(line?.ending?.quantity);
};

const registerOpenedDraftTests = (): void => {
  // AC-21 — the whole account of every line, in **one** round trip. The query count is the
  // load-bearing half: an implementation that fetched the Rejections, the conformance or the
  // derived figures in a second query would return exactly these values and must still fail
  // (sad.md §6.3 "the derived Accepted and Rejected Quantities are computed in this same query
  // rather than in a second one").
  it('carries every line’s Rejections, conformance and derived quantities on the opened draft, in one query', async () => {
    const { warehouseId, draftId, refusedLineId, cleanLineId } =
      await buildConditionFixture();

    const { result: detail, queryCount } = await withQueryCount(() =>
      repository.readIdentifiedDraft(draftId, warehouseId, 'with_cause'),
    );

    expect(queryCount).toBe(1);
    expectRefusedLineAccount(findLine(detail, refusedLineId));
    expectCleanLineAccount(findLine(detail, cleanLineId));
  });

  // The redacted form withholds **customer identity**, never the condition: a member who prepares
  // the dock may hold no customer-reading Permission at all and still reads what arrived and what
  // was refused (AC-09a, sad.md §6.3 — the two withholdings are independent).
  it('carries the same account on the redacted opened draft, in one query', async () => {
    const { warehouseId, draftId, refusedLineId, preReleaseLineId } =
      await buildConditionFixture();

    const { result: detail, queryCount } = await withQueryCount(() =>
      repository.readRedactedDraft(draftId, warehouseId, 'with_cause'),
    );

    expect(queryCount).toBe(1);
    expectRefusedLineAccount(findLine(detail, refusedLineId));
    expectPreReleaseLineAccount(findLine(detail, preReleaseLineId));
  });
};

const registerByLineTests = (): void => {
  // AC-22 — the by-line read is the same line projection over the same rows, so it must carry the
  // same account, and in one round trip as well.
  it('carries every line’s Rejections, conformance and derived quantities on the by-line read, in one query', async () => {
    const { warehouseId, refusedLineId, cleanLineId, preReleaseLineId } =
      await buildConditionFixture();

    const { result: entries, queryCount } = await withQueryCount(() =>
      repository.listIdentifiedLines(warehouseId, {}, 'with_cause'),
    );

    expect(queryCount).toBe(1);
    expectRefusedLineAccount(findEntryLine(entries, refusedLineId));
    expectCleanLineAccount(findEntryLine(entries, cleanLineId));
    expectPreReleaseLineAccount(findEntryLine(entries, preReleaseLineId));
  });

  it('carries the same account on the redacted by-line read', async () => {
    const { warehouseId, refusedLineId } = await buildConditionFixture();

    const entries = await repository.listRedactedLines(
      warehouseId,
      {},
      'with_cause',
    );

    expectRefusedLineAccount(findEntryLine(entries, refusedLineId));
  });
};

const registerPreReleaseEndingTests = (): void => {
  // sad.md §7 / spec.md §8 tenth question — the absent case, stated on its own because it is the
  // back-compatibility proof: nothing was backfilled, so the read must not invent a verdict, must
  // not report a refusal, and must still hand the Allocation bound the figure it was told to treat
  // as the Accepted Quantity.
  it('reads a line whose ending predates this release as no conformance, no Rejections and an Accepted Quantity equal to its ending quantity', async () => {
    const { warehouseId, draftId, preReleaseLineId } =
      await buildConditionFixture();

    const detail = await repository.readIdentifiedDraft(
      draftId,
      warehouseId,
      'with_cause',
    );

    expectPreReleaseLineAccount(findLine(detail, preReleaseLineId));
  });
};

const registerNonFanOutTests = (): void => {
  // The per-line Rejection aggregation is a second one-to-many beneath a line that already
  // aggregates its links. Joined rather than correlated, each would multiply the other: two links
  // and two Rejections would report four of each and a Rejected Quantity of 16 rather than 8
  // (data-model.md "the non-fan-out requirement").
  it('does not multiply a line’s links by its Rejections, nor its Rejections by its links', async () => {
    const { warehouseId, userId, itemId, draftId, refusedLineId } =
      await buildConditionFixture();

    for (let index = 0; index < 2; index += 1) {
      const orderId = randomUUID();
      await dataSource.manager.getRepository(CustomerOrderEntity).insert({
        id: orderId,
        warehouseId,
        itemId,
        customerName: 'Buyer One',
        quantity: 10,
        outstandingQuantity: 10,
        neededBy: '2026-09-30',
        state: 'unfulfilled',
        cancellationReason: null,
        recordedByUserId: userId,
        cancelledByUserId: null,
        cancelledAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const linkId = randomUUID();
      await dataSource.manager
        .getRepository(PurchaseDraftLineLinkEntity)
        .insert({
          id: linkId,
          purchaseDraftLineId: refusedLineId,
          purchaseDraftId: draftId,
          warehouseId,
          customerOrderId: orderId,
          statedQuantity: 10,
          createdAt: now,
          updatedAt: now,
        });
      await dataSource.manager.getRepository(DemandSnapshotEntryEntity).insert({
        purchaseDraftLineLinkId: linkId,
        purchaseDraftLineId: refusedLineId,
        customerOrderId: orderId,
        capturedQuantity: 10,
        capturedNeededBy: '2026-09-30',
        capturedState: 'unfulfilled',
        createdAt: now,
      });
    }

    const detail = await repository.readIdentifiedDraft(
      draftId,
      warehouseId,
      'with_cause',
    );
    const line = findLine(detail, refusedLineId);

    expect(line?.links).toHaveLength(2);
    expect(line?.ending?.rejections).toHaveLength(2);
    expect(line?.ending?.rejectedQuantity).toBe(8);
    expect(line?.ending?.acceptedQuantity).toBe(92);
  });
};

const registerCatalogueExtensionTests = (): void => {
  // AC-23a — the Rejection Reason catalogue is extended only, and a Rejection **names** its Reason
  // rather than copying the wording, so extending the catalogue after a refusal was recorded
  // changes nothing the member reads back.
  it('reads a recorded Rejection unchanged after the Rejection Reason catalogue is extended', async () => {
    const { warehouseId, draftId, refusedLineId } =
      await buildConditionFixture();

    const before = await repository.readIdentifiedDraft(
      draftId,
      warehouseId,
      'with_cause',
    );

    await dataSource.manager.getRepository(RejectionReasonEntity).insert({
      id: LATER_REJECTION_REASON_ID,
      label: 'Label illegible',
      requiresDescription: false,
      createdAt: amendedAt,
      updatedAt: amendedAt,
    });

    const after = await repository.readIdentifiedDraft(
      draftId,
      warehouseId,
      'with_cause',
    );

    expectRefusedLineAccount(findLine(after, refusedLineId));
    expect(findLine(after, refusedLineId)?.ending?.rejections).toEqual(
      findLine(before, refusedLineId)?.ending?.rejections,
    );
  });

  // AC-23 — the Packaging Type shown is the one **frozen on the line** when it was ordered,
  // whatever the catalogue reads now. The line stores the identifier, so extending the catalogue
  // and reworking a label reaches no recorded line.
  // review-2026-09-09, finding 12 — the name said "and reworded" but the
  // assertion only reads `packagingTypeId`, which a reword cannot move. The
  // label a member actually reads is resolved client-side against the live
  // catalogue (`ClosedPurchaseDraftLine.tsx`), so a reword *would* change what
  // is shown and nothing here proves otherwise. AC-23 names only extension —
  // "read after the catalogue has been extended with further types" — which is
  // what this case genuinely proves; the reword is left in the fixture as
  // noise the read is indifferent to, not as a claim. Packaging-type rewording
  // is outside AC-23's scope and, unlike the Rejection Reason catalogue, has
  // no extend-only gate.
  it('reads the Packaging Type frozen on the line after the Packaging Type catalogue is extended', async () => {
    const { warehouseId, draftId, refusedLineId } =
      await buildConditionFixture();

    await dataSource.manager.getRepository(PackagingTypeEntity).insert({
      id: LATER_PACKAGING_TYPE_ID,
      label: 'Shrink-wrapped pallets',
      createdAt: amendedAt,
      updatedAt: amendedAt,
    });
    await dataSource.manager
      .getRepository(PackagingTypeEntity)
      .update(
        { id: FROZEN_PACKAGING_TYPE_ID },
        { label: 'Cable coil (reworded)' },
      );

    const detail = await repository.readIdentifiedDraft(
      draftId,
      warehouseId,
      'with_cause',
    );
    const line = findLine(detail, refusedLineId);

    expect(line?.packagingTypeId).toBe(FROZEN_PACKAGING_TYPE_ID);
    expect(line?.valueAddingNote).toBe(VALUE_ADDING_NOTE);
  });
};

const registerPlanTests = (): void => {
  // data-model.md § Indexes — one line's Rejections are fetched for sad.md §6.3 through
  // `uq_purchase_draft_line_rejections_line_reason`, whose leading column is the line. The index
  // exists to be pointed at; a per-line aggregation that sequentially scanned the Rejection table
  // once per line is what this pins against.
  it('fetches a line’s Rejections through uq_purchase_draft_line_rejections_line_reason rather than a sequential scan', async () => {
    const { warehouseId, draftId } = await buildConditionFixture();

    const plan = await explainLastQuery(() =>
      repository.readIdentifiedDraft(draftId, warehouseId, 'with_cause'),
    );

    expect(plan).toContain('uq_purchase_draft_line_rejections_line_reason');
  });
};

// The Rejection cause columns spec.md §6.1 protects: every reason, description and disposition,
// together with the amendment attribution that only a named refusal carries. `quantity` and the
// table itself are deliberately **not** here — the withheld shape still reports one total refused
// figure, and that a refusal happened stays visible because presented and accepted differ.
const CAUSE_COLUMNS = [
  'rejection_reason_id',
  'disposition',
  'amended_by_user_id',
  'amended_at',
];

const registerCauseWithheldShapeTests = (): void => {
  // AC-22/sad.md §6.3 step 3, tasks/purchase-draft-read-repository-condition.md § DoD — the withheld
  // shape is built by **not selecting** the withheld columns, never by fetching and deleting them.
  // Asserted against the SQL the repository actually issued, because a projection that fetched the
  // causes and dropped them afterwards would return exactly the object below and must still fail.
  it('issues a withheld-shape query that does not name the Rejection cause columns at all', async () => {
    const { warehouseId, draftId } = await buildConditionFixture();

    const { sql } = await lastStatementOf(() =>
      repository.readIdentifiedDraft(draftId, warehouseId, 'cause_withheld'),
    );

    for (const column of CAUSE_COLUMNS) {
      expect(sql).not.toContain(column);
    }
    expect(sql).not.toContain("'rejections'");
    // The cause-bearing form of the very same read does name them, so the assertion above pins the
    // narrowing rather than a column this query never had.
    const withCause = await lastStatementOf(() =>
      repository.readIdentifiedDraft(draftId, warehouseId, 'with_cause'),
    );
    for (const column of CAUSE_COLUMNS) {
      expect(withCause.sql).toContain(column);
    }
  });

  it('issues a withheld-shape by-line query that does not name the Rejection cause columns at all', async () => {
    const { warehouseId } = await buildConditionFixture();

    const { sql } = await lastStatementOf(() =>
      repository.listIdentifiedLines(warehouseId, {}, 'cause_withheld'),
    );

    for (const column of CAUSE_COLUMNS) {
      expect(sql).not.toContain(column);
    }
    expect(sql).not.toContain("'rejections'");
  });

  // What survives the narrowing: ordered, presented, accepted and **one** total refused figure,
  // plus the Pre-receipt Conformance, which is a judgement about the supplier's instruction rather
  // than a Rejection's cause and is not gated on the cause grant (openapi.yaml
  // `LineConditionCauseWithheld`, `PreReceiptConformance`).
  it('returns the withheld shape with no rejections property, still carrying one total refused figure', async () => {
    const { warehouseId, draftId, refusedLineId } =
      await buildConditionFixture();

    const detail = await repository.readIdentifiedDraft(
      draftId,
      warehouseId,
      'cause_withheld',
    );
    const ending = findLine(detail, refusedLineId)?.ending;

    expect(ending?.quantity).toBe(100);
    expect(ending?.rejectedQuantity).toBe(8);
    expect(ending?.acceptedQuantity).toBe(92);
    expect(ending?.preReceiptConformance).toEqual({
      verdict: 'not_met',
      note: CONFORMANCE_NOTE,
    });
    // Absent as a property, not empty: a placeholder is itself a disclosure that can be probed, and
    // the number of distinct refusals on a line is exactly what spec.md §6.1 protects.
    expect('rejections' in (ending as unknown as object)).toBe(false);
  });
};

describe('PurchaseDraftReadRepository condition breakdown', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE purchase_draft_line_rejections, arrival_allocations, purchase_draft_demand_snapshots, purchase_draft_line_links, purchase_draft_lines, purchase_drafts, item_stock_adjustments, customer_orders, items, warehouse_memberships, roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
    // Neither catalogue is truncated — both are migration-seeded reference data every test here
    // reads. Only the rows the extension tests added are removed, and the reworded label is put
    // back, so no test can see another's extension.
    await dataSource.manager
      .getRepository(RejectionReasonEntity)
      .delete({ id: LATER_REJECTION_REASON_ID });
    await dataSource.manager
      .getRepository(PackagingTypeEntity)
      .delete({ id: LATER_PACKAGING_TYPE_ID });
    await dataSource.manager
      .getRepository(PackagingTypeEntity)
      .update({ id: FROZEN_PACKAGING_TYPE_ID }, { label: 'Cable coil' });
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  registerOpenedDraftTests();
  registerByLineTests();
  registerPreReleaseEndingTests();
  registerNonFanOutTests();
  registerCatalogueExtensionTests();
  registerCauseWithheldShapeTests();
  registerPlanTests();
});
