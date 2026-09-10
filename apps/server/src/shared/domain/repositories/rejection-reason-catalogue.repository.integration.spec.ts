import dataSource from 'shared/database/data-source';
import type { RejectionReasonEntity } from 'shared/domain/entities/rejection-reason.entity';
// `RejectionReasonCatalogueRepository` does not exist yet (T4) — this is the RED for AC-06/AC-07's
// persistence half. `data-model.md` § "Repository boundaries" asks for "the
// `PackagingTypeCatalogueRepository` shape with one method more": the catalogue listed whole, taking
// no Warehouse scope, and a **stated set** of identifiers resolved against it "in one read, rather
// than a read per identifier", each resolved row carrying `requires_description` so AC-07 is decided
// against the flag rather than against `unfit_other` by name (`sad.md` §4).
import { RejectionReasonCatalogueRepository } from 'shared/domain/repositories/rejection-reason-catalogue.repository';
// `PostgresQueryRunner.prototype.query` is the one method every TypeORM access path — raw
// `manager.query`, `repository.find`, and `QueryBuilder` alike — ultimately calls to reach
// PostgreSQL. Spying on it, rather than on a higher-level TypeORM API, counts actual round trips
// regardless of which API the implementer picks, which is what proves "one read" rather than merely
// "one repository method call" (`item-catalogue.repository.integration.spec.ts`'s idiom).
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { initialRejectionReasons } from '../../../../migrations/1786800000000-CreateArrivalInspectionSchema';

// The shape this RED expects the implementer to expose. Cast through it because the module does not
// exist yet, exactly as `packaging-type-catalogue.repository.integration.spec.ts` did for T12.
interface RejectionReasonCatalogueRepositoryContract {
  listRejectionReasons(): Promise<RejectionReasonEntity[]>;
  resolveRejectionReasons(
    rejectionReasonIds: readonly string[],
  ): Promise<RejectionReasonEntity[]>;
}

const repository = new RejectionReasonCatalogueRepository(
  dataSource,
) as unknown as RejectionReasonCatalogueRepositoryContract;

const seededIds = initialRejectionReasons.map(([id]) => id);
const seededIdsAscending = [...seededIds].sort();

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

const registerListTests = (): void => {
  describe('listRejectionReasons', () => {
    // AC-06 — "the reasons available" is not a hard-coded guess here: it is read from the migration
    // that seeded the catalogue, so what this repository reads and what the schema holds cannot
    // silently diverge (`packaging-type-catalogue.repository.integration.spec.ts`'s precedent).
    it('lists the whole catalogue, ordered by identifier, taking no Warehouse scope', async () => {
      const reasons = await repository.listRejectionReasons();

      expect(reasons.map((reason) => reason.id)).toEqual(seededIdsAscending);
      expect(reasons).toHaveLength(initialRejectionReasons.length);
      // Unpaged and unscoped: the method takes no argument at all, so no caller can narrow it to a
      // Warehouse and no page can truncate it (`sad.md` §4 — the catalogue is system-wide).
      expect(repository.listRejectionReasons).toHaveLength(0);
    });

    it('carries each seeded row whole, label and prose requirement together', async () => {
      const reasons = await repository.listRejectionReasons();

      for (const [id, label, requiresDescription] of initialRejectionReasons) {
        expect(reasons).toContainEqual(
          expect.objectContaining({ id, label, requiresDescription }),
        );
      }
    });
  });
};

const registerResolveTests = (): void => {
  describe('resolveRejectionReasons', () => {
    // AC-06/`data-model.md` § "Repository boundaries" — a submission naming several Reasons costs
    // **one** statement, not one per Reason. An implementation looping `findOneBy` returns the same
    // rows and fails here, which is the whole point of counting round trips.
    it('resolves a stated set of several identifiers in exactly one statement', async () => {
      const stated = [
        'damaged_in_transit',
        'quality_defect',
        'unfit_other',
        'packaging_not_as_instructed',
      ];

      const { result, queryCount } = await withQueryCount(() =>
        repository.resolveRejectionReasons(stated),
      );

      expect(queryCount).toBe(1);
      expect(result.map((reason) => reason.id).sort()).toEqual(
        [...stated].sort(),
      );
    });

    // AC-06 — which of the stated identifiers the catalogue does **not** offer is answerable from
    // this one read: an identifier the catalogue has no row for comes back absent, so the command
    // can name it without a second query. Still one statement, whatever the submission states.
    it('omits an identifier the catalogue does not offer, still in one statement', async () => {
      const stated = [
        'damaged_in_transit',
        'not_a_catalogue_reason',
        'unfit_other',
      ];

      const { result, queryCount } = await withQueryCount(() =>
        repository.resolveRejectionReasons(stated),
      );

      expect(queryCount).toBe(1);
      expect(result.map((reason) => reason.id).sort()).toEqual([
        'damaged_in_transit',
        'unfit_other',
      ]);
      const unknown = stated.filter(
        (id) => !result.some((reason) => reason.id === id),
      );
      expect(unknown).toEqual(['not_a_catalogue_reason']);
    });

    it('resolves nothing when no stated identifier is offered', async () => {
      const result = await repository.resolveRejectionReasons([
        'not_a_catalogue_reason',
        'also_not_one',
      ]);

      expect(result).toEqual([]);
    });

    // AC-07/`sad.md` §4 — the prose requirement travels on the resolved row, so the ending command
    // decides "this Reason needs a description" against catalogue data and never against
    // `unfit_other` by name. `unfit_other` is the only row the migration seeds `true`, and both
    // sides of the flag are asserted so a repository dropping the column cannot pass.
    it('carries requiresDescription on every resolved row', async () => {
      const result = await repository.resolveRejectionReasons([
        'unfit_other',
        'damaged_in_transit',
      ]);

      const byId = new Map(result.map((reason) => [reason.id, reason]));
      expect(byId.get('unfit_other')).toMatchObject({
        requiresDescription: true,
      });
      expect(byId.get('damaged_in_transit')).toMatchObject({
        requiresDescription: false,
      });
    });

    it('resolves every seeded identifier at once when a submission states them all', async () => {
      const { result, queryCount } = await withQueryCount(() =>
        repository.resolveRejectionReasons(seededIds),
      );

      expect(queryCount).toBe(1);
      expect(result.map((reason) => reason.id).sort()).toEqual(
        seededIdsAscending,
      );
    });
  });
};

describe('RejectionReasonCatalogueRepository', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  registerListTests();
  registerResolveTests();
});
