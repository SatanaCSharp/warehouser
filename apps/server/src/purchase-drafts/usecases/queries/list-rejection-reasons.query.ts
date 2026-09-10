import { Injectable } from '@nestjs/common';
import type { RejectionReasonCatalogueItem } from 'purchase-drafts/domain/mappers/rejection-reason.mapper';
import { toRejectionReasonCatalogueItem } from 'purchase-drafts/domain/mappers/rejection-reason.mapper';
import { RejectionReasonCatalogueRepository } from 'shared/domain/repositories/rejection-reason-catalogue.repository';

// AC-06/AC-07 — the Rejection Reason catalogue, served at `/rejection-reasons` (openapi.yaml). The
// same catalogue an ending's Rejections are validated against, so the member picks from exactly
// what the server will accept. The catalogue is workspace-wide reference data, so it takes no
// Warehouse scope.
//
// It projects through `toRejectionReasonCatalogueItem` rather than handing back the repository's
// `RejectionReasonEntity`: server-architecture.md §"Use cases" forbids a use case depending on a
// TypeORM entity, and returning one made every consumer — the controller included — depend on the
// persistence class (code-review-back-end-2026-09-09.md).
@Injectable()
export class ListRejectionReasonsQuery {
  constructor(
    private readonly repository: RejectionReasonCatalogueRepository,
  ) {}

  async execute(): Promise<RejectionReasonCatalogueItem[]> {
    const catalogue = await this.repository.listRejectionReasons();

    return catalogue.map(toRejectionReasonCatalogueItem);
  }
}
