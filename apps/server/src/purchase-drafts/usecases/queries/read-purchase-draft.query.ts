import { Injectable } from '@nestjs/common';
import type { PurchaseDraftLineLinkWithDrift } from 'purchase-drafts/usecases/queries/drift-signals';
import { withDriftSignals } from 'purchase-drafts/usecases/queries/drift-signals';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type {
  PurchaseDraftDetailRead,
  PurchaseDraftLineRead,
} from 'shared/domain/repositories/purchase-draft-read.repository';
import { PurchaseDraftReadRepository } from 'shared/domain/repositories/purchase-draft-read.repository';

export type PurchaseDraftLineWithDrift = Omit<
  PurchaseDraftLineRead,
  'links'
> & {
  readonly links: readonly PurchaseDraftLineLinkWithDrift[];
};

// openapi.yaml `PurchaseDraftDetail`, with every link's `driftSignals` derived.
export type PurchaseDraftDetailWithDrift = Omit<
  PurchaseDraftDetailRead,
  'lines'
> & {
  readonly lines: readonly PurchaseDraftLineWithDrift[];
};

// AC-16/AC-18 — the application boundary of reading one draft with its per-link Drift Signals
// derived (server-architecture.md §Dependency direction, §Use cases). The repository hands back
// the raw snapshot/current comparison inputs only; naming the Drift Signal is a value comparison
// this layer owns, computed on every read and stored nowhere, which is what makes a redirection
// visible on the next read and stops the report once the order is redirected back (AC-18a).
@Injectable()
export class ReadPurchaseDraftQuery {
  constructor(private readonly repository: PurchaseDraftReadRepository) {}

  async execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
  ): Promise<PurchaseDraftDetailWithDrift | null> {
    const detail = await this.repository.readDraft(
      purchaseDraftId,
      currentUser.warehouseId,
    );

    if (detail === null) {
      return null;
    }

    return {
      ...detail,
      lines: detail.lines.map((line) => ({
        ...line,
        links: line.links.map(withDriftSignals),
      })),
    };
  }
}
