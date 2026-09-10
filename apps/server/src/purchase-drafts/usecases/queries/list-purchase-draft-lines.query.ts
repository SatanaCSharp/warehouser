import { Injectable } from '@nestjs/common';
import { withCondition } from 'purchase-drafts/domain/mappers/line-condition.mapper';
import { readsRejectionCause } from 'purchase-drafts/domain/predicates/rejection-cause-access.predicates';
import { RejectionReasonLabelService } from 'purchase-drafts/domain/services/rejection-reason-label.service';
import { withDriftSignals } from 'purchase-drafts/usecases/queries/drift-signals';
import type { PurchaseDraftLineWithDrift } from 'purchase-drafts/usecases/queries/read-purchase-draft.query';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type {
  PurchaseDraftLineFilters,
  PurchaseDraftLineListEntryRedactedRead,
} from 'shared/domain/repositories/purchase-draft-read.repository';
import { PurchaseDraftReadRepository } from 'shared/domain/repositories/purchase-draft-read.repository';
import { readsCustomerIdentity } from 'shared/predicates/observed-permission.predicates';

// openapi.yaml `PurchaseDraftLineListEntry`, with every link's `driftSignals` derived and its line
// in whichever of the two forms the observed Permission selected (AC-09a, AC-22).
export type PurchaseDraftLineListEntryWithDrift = Omit<
  PurchaseDraftLineListEntryRedactedRead,
  'line'
> & {
  readonly line: PurchaseDraftLineWithDrift;
};

// AC-22 — the application boundary of the by-line read: the acting Warehouse's lines, each returned
// under the Delivery Mode that places it, so a member preparing the dock sees only the goods they
// will physically handle. The split is the repository's single query; this layer scopes the read to
// the acting Warehouse and derives each link's Drift Signals with the same value comparison the
// opened draft uses, so the two surfaces can never disagree about one link.
//
// AC-09a/AC-10 — and it redacts on the same terms the opened draft does, through the same predicate
// over the same principal. A member preparing the dock who holds no `CUSTOMERS:WATCH` still reads
// every Via Warehouse line's `warehouseDestination` in full: the Warehouse's own address and access
// notes are the operator's premises data, not customer identity, and are never withheld (sad.md §7).
//
// AC-21/AC-22 — and it builds each line's condition account the same way `ReadPurchaseDraftQuery`
// does, over the same repository columns and the same catalogue, so the opened draft and the
// by-line view can never disagree about one line's condition either.
@Injectable()
export class ListPurchaseDraftLinesQuery {
  constructor(
    private readonly repository: PurchaseDraftReadRepository,
    private readonly rejectionReasonLabels: RejectionReasonLabelService,
  ) {}

  async execute(
    currentUser: AccessCurrentUser,
    filters?: PurchaseDraftLineFilters,
  ): Promise<PurchaseDraftLineListEntryWithDrift[]> {
    // Independent of the identity narrowing and decided the same way — over the observed
    // Permission set, never over the surface (AC-21, AC-22, sad.md §6.3).
    const cause = readsRejectionCause(currentUser.observedPermissionIds)
      ? 'with_cause'
      : 'cause_withheld';

    if (!readsCustomerIdentity(currentUser.observedPermissionIds)) {
      const redacted = await this.repository.listRedactedLines(
        currentUser.warehouseId,
        filters ?? {},
        cause,
      );

      const rejectionReasonLabels = await this.rejectionReasonLabels.labelsFor(
        redacted.map((entry) => entry.line.ending),
      );

      return redacted.map((entry) => ({
        ...entry,
        line: {
          ...entry.line,
          ending: withCondition(entry.line.ending, rejectionReasonLabels),
          links: entry.line.links.map(withDriftSignals),
        },
      }));
    }

    const identified = await this.repository.listIdentifiedLines(
      currentUser.warehouseId,
      filters ?? {},
      cause,
    );

    const rejectionReasonLabels = await this.rejectionReasonLabels.labelsFor(
      identified.map((entry) => entry.line.ending),
    );

    return identified.map((entry) => ({
      ...entry,
      line: {
        ...entry.line,
        ending: withCondition(entry.line.ending, rejectionReasonLabels),
        links: entry.line.links.map(withDriftSignals),
      },
    }));
  }
}
