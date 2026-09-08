import { Injectable } from '@nestjs/common';
import type { RejectionReasonEntity } from 'shared/domain/entities/rejection-reason.entity';
import { RejectionReasonCatalogueRepository } from 'shared/domain/repositories/rejection-reason-catalogue.repository';

// AC-06/AC-07 — the Rejection Reason catalogue, served at `/rejection-reasons` (openapi.yaml). The
// same catalogue an ending's Rejections are validated against, so the member picks from exactly
// what the server will accept. A thin pass-through that adds no derivation of its own, following
// `ListPackagingTypesQuery`'s shape: the catalogue is workspace-wide reference data, so it takes no
// Warehouse scope.
@Injectable()
export class ListRejectionReasonsQuery {
  constructor(
    private readonly repository: RejectionReasonCatalogueRepository,
  ) {}

  execute(): Promise<RejectionReasonEntity[]> {
    return this.repository.listRejectionReasons();
  }
}
