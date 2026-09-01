import dataSource from 'shared/database/data-source';
import type { PackagingTypeEntity } from 'shared/domain/entities/packaging-type.entity';
// `PackagingTypeCatalogueRepository` does not exist yet (T12) — this is the RED for AC-13's
// happy-path half: the four entries `1786600000000-CreateOrderingSchema.ts` seeds
// (`initialPackagingTypes`) are readable as the system-managed, migration-only catalogue
// `CONTEXT.md` §Invariants describes. The four ids are read from the migration itself, per
// `restore-catalogues.setup.ts`'s existing precedent, so this test cannot drift from what is
// actually seeded.
import { PackagingTypeCatalogueRepository } from 'shared/domain/repositories/packaging-type-catalogue.repository';

import { initialPackagingTypes } from '../../../../migrations/1786600000000-CreateOrderingSchema';

interface PackagingTypeCatalogueRepositoryContract {
  listPackagingTypes(): Promise<PackagingTypeEntity[]>;
}

const repository = new PackagingTypeCatalogueRepository(
  dataSource,
) as unknown as PackagingTypeCatalogueRepositoryContract;

describe('PackagingTypeCatalogueRepository', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  // AC-13 — "Loose Items, Cartons, Pallets, Cable Coil" is not a hard-coded guess in this test:
  // it is read straight from the migration that seeded them, so the catalogue this repository
  // reads and the catalogue the schema actually holds cannot silently diverge.
  it('lists exactly the four seeded Packaging Types', async () => {
    const packagingTypes = await repository.listPackagingTypes();

    const ids = packagingTypes.map((packagingType) => packagingType.id).sort();
    const expectedIds = initialPackagingTypes
      .map(([id]) => id)
      .slice()
      .sort();

    expect(ids).toEqual(expectedIds);
    expect(packagingTypes).toHaveLength(4);

    for (const [id, label] of initialPackagingTypes) {
      expect(packagingTypes).toContainEqual(
        expect.objectContaining({ id, label }),
      );
    }
  });
});
