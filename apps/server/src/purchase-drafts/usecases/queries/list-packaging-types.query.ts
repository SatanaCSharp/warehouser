import { Injectable } from '@nestjs/common';
import type { PackagingTypeEntity } from 'shared/domain/entities/packaging-type.entity';
import { PackagingTypeCatalogueRepository } from 'shared/domain/repositories/packaging-type-catalogue.repository';

// AC-13 — the Packaging Type catalogue, served at `/packaging-types` (openapi.yaml). The same
// catalogue `PurchaseDraftAssemblyService` refuses an unknown type against, so the member picks
// from exactly what the rule accepts. A thin pass-through that adds no derivation of its own; the
// catalogue is workspace-wide reference data, so it takes no Warehouse scope.
@Injectable()
export class ListPackagingTypesQuery {
  constructor(private readonly repository: PackagingTypeCatalogueRepository) {}

  execute(): Promise<PackagingTypeEntity[]> {
    return this.repository.listPackagingTypes();
  }
}
