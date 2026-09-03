import { Injectable } from '@nestjs/common';
import { withDriftSignals } from 'purchase-drafts/usecases/queries/drift-signals';
import type { PurchaseDraftLineWithDrift } from 'purchase-drafts/usecases/queries/read-purchase-draft.query';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type {
  PurchaseDraftLineFilters,
  PurchaseDraftLineListEntryRead,
} from 'shared/domain/repositories/purchase-draft-read.repository';
import { PurchaseDraftReadRepository } from 'shared/domain/repositories/purchase-draft-read.repository';

// openapi.yaml `PurchaseDraftLineListEntry`, with every link's `driftSignals` derived.
export type PurchaseDraftLineListEntryWithDrift = Omit<
  PurchaseDraftLineListEntryRead,
  'line'
> & {
  readonly line: PurchaseDraftLineWithDrift;
};

// AC-22 — the application boundary of the by-line read: the acting Warehouse's lines, each
// returned under the Delivery Mode that places it, so a member preparing the dock sees only the
// goods they will physically handle. The split is the repository's single query; this layer scopes
// the read to the acting Warehouse and derives each link's Drift Signals with the same value
// comparison the opened draft uses, so the two surfaces can never disagree about one link.
@Injectable()
export class ListPurchaseDraftLinesQuery {
  constructor(private readonly repository: PurchaseDraftReadRepository) {}

  async execute(
    currentUser: AccessCurrentUser,
    filters?: PurchaseDraftLineFilters,
  ): Promise<PurchaseDraftLineListEntryWithDrift[]> {
    const entries = await this.repository.listLines(
      currentUser.warehouseId,
      filters,
    );

    return entries.map((entry) => ({
      ...entry,
      line: {
        ...entry.line,
        links: entry.line.links.map(withDriftSignals),
      },
    }));
  }
}
