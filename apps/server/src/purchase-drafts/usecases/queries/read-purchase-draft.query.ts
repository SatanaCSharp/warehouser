import { Injectable } from '@nestjs/common';
import { isNull } from '@warehouser/utils/predicates';
import { withCondition } from 'purchase-drafts/domain/mappers/line-condition.mapper';
import { readsRejectionCause } from 'purchase-drafts/domain/predicates/rejection-cause-access.predicates';
import type { PurchaseDraftDetailWithDrift } from 'purchase-drafts/domain/projections/purchase-draft-projection';
import { withDriftSignals } from 'purchase-drafts/domain/projections/purchase-draft-projection';
import { RejectionReasonLabelService } from 'purchase-drafts/domain/services/rejection-reason-label.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { PurchaseDraftReadRepository } from 'shared/domain/repositories/purchase-draft-read.repository';
import { readsCustomerIdentity } from 'shared/predicates/observed-permission.predicates';

// AC-16/AC-18/AC-09a — the application boundary of reading one draft with its per-link Drift
// Signals derived (server-architecture.md §Dependency direction, §Use cases). The repository hands
// back the raw snapshot/current comparison inputs only; naming the Drift Signal is a value
// comparison this layer owns, computed on every read and stored nowhere, which is what makes a
// redirection visible on the next read and stops the report once the order is redirected back
// (AC-18a).
//
// Which of the two forms is read is decided **here**, over the principal the guard resolved, and by
// issuing a different query rather than by filtering one: the redacted read selects no customer, no
// captured address and no current address at all (ADR 0001,
// server-request-authorization.md § "Consume the observed set in the projection"). The surface
// never makes this choice; a handler only declares the Permission it observes.
//
// AC-21/AC-22 — and it builds each line's condition account the same way: the repository hands the
// condition's figures back flat, spliced into the ending's own columns, and this layer nests them
// under `condition` and resolves each Rejection's Reason label from the catalogue, exactly as
// openapi.yaml's `PurchaseDraftLineEnding.condition` models it.
@Injectable()
export class ReadPurchaseDraftQuery {
  constructor(
    private readonly repository: PurchaseDraftReadRepository,
    private readonly rejectionReasonLabels: RejectionReasonLabelService,
  ) {}

  async execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
  ): Promise<PurchaseDraftDetailWithDrift | null> {
    // The cause narrowing is independent of the identity one and decided the same way: over the
    // observed Permission set, never over the surface (AC-21, AC-22, sad.md §6.3).
    const cause = readsRejectionCause(currentUser.observedPermissionIds)
      ? 'with_cause'
      : 'cause_withheld';

    // Two branches rather than one read behind a flag, following `ReadCustomerOrderQuery`'s (T13)
    // shape: each names the query it issues, so "the redacted form selects no identity column" is
    // readable at the call site rather than hidden in a parameter.
    if (!readsCustomerIdentity(currentUser.observedPermissionIds)) {
      const redacted = await this.repository.readRedactedDraft(
        purchaseDraftId,
        currentUser.warehouseId,
        cause,
      );

      if (isNull(redacted)) {
        return null;
      }

      const rejectionReasonLabels = await this.rejectionReasonLabels.labelsFor(
        redacted.lines.map((line) => line.ending),
      );

      return {
        ...redacted,
        lines: redacted.lines.map((line) => ({
          ...line,
          ending: withCondition(line.ending, rejectionReasonLabels),
          links: line.links.map(withDriftSignals),
        })),
      };
    }

    const identified = await this.repository.readIdentifiedDraft(
      purchaseDraftId,
      currentUser.warehouseId,
      cause,
    );

    if (isNull(identified)) {
      return null;
    }

    const rejectionReasonLabels = await this.rejectionReasonLabels.labelsFor(
      identified.lines.map((line) => line.ending),
    );

    return {
      ...identified,
      lines: identified.lines.map((line) => ({
        ...line,
        ending: withCondition(line.ending, rejectionReasonLabels),
        links: line.links.map(withDriftSignals),
      })),
    };
  }
}
