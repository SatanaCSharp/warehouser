import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
// `WarehousePurchasingReadRepository` does not exist yet (T7) — this is the RED for
// `tasks/warehouse-purchasing-and-rejection-repositories.md`'s Purchasing Pipeline half.
// `sad.md` §6.5 / `data-model.md` § "The read model": one statement over `purchase_drafts`,
// `state IN ('draft', 'ready_for_ordering')` only, counting drafts grouped by `state` and by a
// `CASE` over an age derived from `created_at` for a Draft and `readied_at` for a Ready for
// Ordering draft — the two-column-in-one-statement rule AC-10 names. The response shape mirrors
// `openapi.yaml` `PurchasingPipelineStateRow`/`PurchasingPipelineBand`, flattened to one row per
// (state, Age Band) pair because the repository returns persistence-oriented rows, never the
// nested contract shape (`creating-a-server-repository.md`).
import { WarehousePurchasingReadRepository } from 'shared/domain/repositories/warehouse-purchasing-read.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
// Counts actual PostgreSQL round trips — "one statement" — the idiom
// `consolidated-demand.repository.integration.spec.ts` establishes.
import { withQueryCount } from 'test/pglite/query-recorder';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const now = new Date('2026-09-21T09:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

// `openapi.yaml` `OpenPurchaseDraftState`/`AgeBand` — the two open states and the four Draft Age
// spans, both computed entirely inside the statement (`data-model.md` § "Repository boundaries":
// "no repository returns a row set the use case then buckets in memory").
type OpenPurchaseDraftState = 'draft' | 'ready_for_ordering';
type AgeBand =
  'up_to_7_days' | 'from_8_to_14_days' | 'from_15_to_30_days' | 'over_30_days';

const ALL_AGE_BANDS: readonly AgeBand[] = [
  'up_to_7_days',
  'from_8_to_14_days',
  'from_15_to_30_days',
  'over_30_days',
];
const ALL_STATES: readonly OpenPurchaseDraftState[] = [
  'draft',
  'ready_for_ordering',
];

interface PurchasingPipelineBandRow {
  readonly state: OpenPurchaseDraftState;
  readonly ageBand: AgeBand;
  readonly draftCount: number;
}

// The shape this RED step expects the implementer to expose. Cast through this interface because
// `WarehousePurchasingReadRepository` is `error`-typed while the module does not exist yet
// (the same idiom `consolidated-demand.repository.integration.spec.ts` uses).
interface WarehousePurchasingReadRepositoryContract {
  readPurchasingPipeline(
    warehouseId: string,
    timezone: string,
  ): Promise<PurchasingPipelineBandRow[]>;
}

const repository = new WarehousePurchasingReadRepository(
  dataSource,
) as unknown as WarehousePurchasingReadRepositoryContract;

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

type PurchaseDraftState =
  'draft' | 'ready_for_ordering' | 'closed' | 'discarded';

interface DraftOverrides {
  readonly state: PurchaseDraftState;
  readonly createdAt: Date;
  readonly readiedAt?: Date | null;
}

/**
 * Seeds one Purchase Draft with an explicit `created_at`/`readied_at`, which is what lets a test
 * place it in a chosen Age Band regardless of which of the two columns the band is computed from
 * (AC-10) — `chk_purchase_drafts_readiness_attribution` requires the readying attribution on every
 * state but Draft, and `chk_purchase_drafts_closure_path` requires a Closed draft's closure.
 */
const seedDraft = async (
  warehouseId: string,
  userId: string,
  overrides: DraftOverrides,
): Promise<string> => {
  const id = randomUUID();
  const isReadied =
    overrides.state !== 'draft' && overrides.state !== 'discarded';
  const isClosed = overrides.state === 'closed';
  const isDiscarded = overrides.state === 'discarded';
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id,
    warehouseId,
    state: overrides.state,
    expectedArrivalDate: null,
    createdByUserId: userId,
    readiedByUserId: isReadied ? userId : null,
    readiedAt: isReadied ? (overrides.readiedAt ?? now) : null,
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
    closedByUserId: isClosed ? userId : null,
    closedAt: isClosed ? now : null,
    closureReason: isClosed ? 'Supplier discontinued the line' : null,
    discardedByUserId: isDiscarded ? userId : null,
    discardedAt: isDiscarded ? now : null,
    createdAt: overrides.createdAt,
    updatedAt: overrides.createdAt,
  });
  return id;
};

const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

const bandRowOf = (
  rows: readonly PurchasingPipelineBandRow[],
  state: OpenPurchaseDraftState,
  ageBand: AgeBand,
): PurchasingPipelineBandRow | undefined =>
  rows.find((row) => row.state === state && row.ageBand === ageBand);

const registerAllBandsAndAgeSourceTests = (): void => {
  // AC-10 happy path, and the DoD's "All four Age Bands are produced by the statement, not by the
  // caller": a draft readied yesterday after a month in Draft must read as a day old — the age is
  // `readied_at`'s, never `created_at`'s, once a draft is Ready for Ordering — and every one of the
  // eight (state, Age Band) combinations is present in the one statement's own result, a band with
  // no draft in it reporting 0 rather than being absent (`openapi.yaml`
  // `PurchasingPipelineStateRow.bands`: "minItems: 4, maxItems: 4 ... a band with no draft
  // reporting 0").
  it('produces all eight (state, Age Band) rows from one statement, and reads a draft readied yesterday after a month in Draft as a day old', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);

    // A Draft, ten days old — falls in from_8_to_14_days.
    await seedDraft(warehouseId, userId, {
      state: 'draft',
      createdAt: daysAgo(10),
    });

    // A Ready for Ordering draft created a month ago but readied yesterday: AC-10's own example.
    // If the band were derived from `created_at` this would land in over_30_days instead.
    await seedDraft(warehouseId, userId, {
      state: 'ready_for_ordering',
      createdAt: daysAgo(31),
      readiedAt: daysAgo(1),
    });

    const { result: rows, queryCount } = await withQueryCount(() =>
      repository.readPurchasingPipeline(warehouseId, 'UTC'),
    );

    expect(queryCount).toBe(1);
    expect(rows).toHaveLength(ALL_STATES.length * ALL_AGE_BANDS.length);
    for (const state of ALL_STATES) {
      for (const ageBand of ALL_AGE_BANDS) {
        expect(bandRowOf(rows, state, ageBand)).toBeDefined();
      }
    }

    expect(bandRowOf(rows, 'draft', 'from_8_to_14_days')?.draftCount).toBe(1);
    expect(bandRowOf(rows, 'draft', 'up_to_7_days')?.draftCount).toBe(0);
    expect(bandRowOf(rows, 'draft', 'from_15_to_30_days')?.draftCount).toBe(0);
    expect(bandRowOf(rows, 'draft', 'over_30_days')?.draftCount).toBe(0);

    // The AC-10 assertion itself: readied yesterday reads as a day old, never as a month old.
    expect(
      bandRowOf(rows, 'ready_for_ordering', 'up_to_7_days')?.draftCount,
    ).toBe(1);
    expect(
      bandRowOf(rows, 'ready_for_ordering', 'over_30_days')?.draftCount,
    ).toBe(0);
  });
};

const registerExclusionTests = (): void => {
  // AC-11 — a Closed or Discarded draft is counted nowhere. Seeded with ages that would place them
  // in an otherwise-empty band if the exclusion were missing, so a defect here cannot hide behind a
  // band already holding an open draft.
  it('counts a Closed and a Discarded draft nowhere (AC-11)', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);

    await seedDraft(warehouseId, userId, {
      state: 'draft',
      createdAt: daysAgo(3),
    });
    await seedDraft(warehouseId, userId, {
      state: 'closed',
      createdAt: daysAgo(3),
    });
    await seedDraft(warehouseId, userId, {
      state: 'discarded',
      createdAt: daysAgo(3),
    });

    const rows = await repository.readPurchasingPipeline(warehouseId, 'UTC');
    const totalCount = rows.reduce((sum, row) => sum + row.draftCount, 0);

    // Exactly the one open draft, whichever band it fell into — the Closed and the Discarded draft
    // contribute nothing at all, not even to a row of their own.
    expect(totalCount).toBe(1);
    expect(bandRowOf(rows, 'draft', 'up_to_7_days')?.draftCount).toBe(1);
  });
};

const registerAggregationIntegrityTests = (): void => {
  // spec.md §6 "Aggregation integrity": 0 figures whose value changes when a record unrelated to
  // that figure's own aggregation gains a row. Every (state, Age Band) count but the one a new
  // draft belongs to must be unaffected by that draft's arrival.
  it('leaves every other (state, Age Band) count unchanged when one draft is added to one band', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    const userId = await seedUser(workspaceId);

    await seedDraft(warehouseId, userId, {
      state: 'draft',
      createdAt: daysAgo(3),
    });
    await seedDraft(warehouseId, userId, {
      state: 'ready_for_ordering',
      createdAt: daysAgo(25),
      readiedAt: daysAgo(20),
    });

    const before = await repository.readPurchasingPipeline(warehouseId, 'UTC');

    await seedDraft(warehouseId, userId, {
      state: 'draft',
      createdAt: daysAgo(3),
    });

    const after = await repository.readPurchasingPipeline(warehouseId, 'UTC');

    for (const state of ALL_STATES) {
      for (const ageBand of ALL_AGE_BANDS) {
        const isMutatedRow = state === 'draft' && ageBand === 'up_to_7_days';
        const beforeCount = bandRowOf(before, state, ageBand)?.draftCount;
        const afterCount = bandRowOf(after, state, ageBand)?.draftCount;

        if (isMutatedRow) {
          expect(afterCount).toBe((beforeCount ?? 0) + 1);
        } else {
          expect(afterCount).toBe(beforeCount);
        }
      }
    }
  });
};

describe('WarehousePurchasingReadRepository', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE purchase_drafts, warehouse_memberships, roles, warehouses, sessions, users, accounts, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  registerAllBandsAndAgeSourceTests();
  registerExclusionTests();
  registerAggregationIntegrityTests();
});
