import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { PackagingTypeEntity } from 'shared/domain/entities/packaging-type.entity';
import { DataSource } from 'typeorm';

// AC-13 — the Packaging Type catalogue is system-managed and migration-seeded
// (`1786600000000-CreateOrderingSchema.ts`'s `initialPackagingTypes`); this repository only reads
// it.
@Injectable()
export class PackagingTypeCatalogueRepository {
  constructor(private readonly dataSource: DataSource) {}

  listPackagingTypes(): Promise<PackagingTypeEntity[]> {
    return getEntityManager(this.dataSource)
      .getRepository(PackagingTypeEntity)
      .find({ order: { id: 'ASC' } });
  }
}
