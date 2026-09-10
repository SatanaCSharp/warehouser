import { Injectable } from '@nestjs/common';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import type { ConsolidatedDemandLineRead } from 'shared/domain/repositories/consolidated-demand.repository.js';
import { ConsolidatedDemandRepository } from 'shared/domain/repositories/consolidated-demand.repository.js';

// AC-04/AC-20 — `sad.md` §6.5 step 5, "returns the Demand Lines whole, nothing paged". This use
// case is a thin adapter: it scopes the read to the acting Warehouse and passes the repository's
// Demand Lines through unchanged, since the response shape already matches openapi.yaml
// `DemandLine`/`DemandCoverage`.
@Injectable()
export class ReadConsolidatedDemandQuery {
  constructor(
    private readonly consolidatedDemandRepository: ConsolidatedDemandRepository,
  ) {}

  execute(
    currentUser: AccessCurrentUser,
  ): Promise<ConsolidatedDemandLineRead[]> {
    return this.consolidatedDemandRepository.readConsolidatedDemand(
      currentUser.warehouseId,
    );
  }
}
