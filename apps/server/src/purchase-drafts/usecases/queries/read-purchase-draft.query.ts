import { Injectable } from '@nestjs/common';
import type { PurchaseDraftLineEndingWithCondition } from 'purchase-drafts/domain/mappers/line-condition.mapper';
import { withCondition } from 'purchase-drafts/domain/mappers/line-condition.mapper';
import { readsRejectionCause } from 'purchase-drafts/domain/predicates/rejection-cause-access.predicates';
import { RejectionReasonLabelService } from 'purchase-drafts/domain/services/rejection-reason-label.service';
import type {
  PurchaseDraftLineLinkIdentifiedWithDrift,
  PurchaseDraftLineLinkRedactedWithDrift,
} from 'purchase-drafts/usecases/queries/drift-signals';
import { withDriftSignals } from 'purchase-drafts/usecases/queries/drift-signals';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type {
  PurchaseDraftLineIdentifiedRead,
  PurchaseDraftLineRedactedRead,
  PurchaseDraftSummaryRead,
} from 'shared/domain/repositories/purchase-draft-read.repository';
import { PurchaseDraftReadRepository } from 'shared/domain/repositories/purchase-draft-read.repository';
import { readsCustomerIdentity } from 'shared/predicates/observed-permission.predicates';

// openapi.yaml `PurchaseDraftLineRedacted` with every link's `driftSignals` derived — what an actor
// **without** the observed `CUSTOMERS:WATCH` is served. It has no `customerDestination` property at
// all: the repository's redacted query never selected one, and TypeScript therefore gives a mapper
// nothing to carry (AC-09a, ADR 0001).
export type PurchaseDraftLineRedactedWithDrift = Omit<
  PurchaseDraftLineRedactedRead,
  'links' | 'ending'
> & {
  readonly links: readonly PurchaseDraftLineLinkRedactedWithDrift[];
  readonly ending: PurchaseDraftLineEndingWithCondition | null;
};

// openapi.yaml `PurchaseDraftLineIdentified` with the same signals derived.
export type PurchaseDraftLineIdentifiedWithDrift = Omit<
  PurchaseDraftLineIdentifiedRead,
  'links' | 'ending'
> & {
  readonly links: readonly PurchaseDraftLineLinkIdentifiedWithDrift[];
  readonly ending: PurchaseDraftLineEndingWithCondition | null;
};

// openapi.yaml `PurchaseDraftLine` — `oneOf` the two forms, exactly as the contract models it. The
// union is carried down to the **line** rather than to the draft, so the one discriminator sits
// where the withheld property does and an empty draft has nothing to discriminate.
export type PurchaseDraftLineWithDrift =
  PurchaseDraftLineIdentifiedWithDrift | PurchaseDraftLineRedactedWithDrift;

// openapi.yaml `PurchaseDraftDetail`.
export type PurchaseDraftDetailWithDrift = PurchaseDraftSummaryRead & {
  readonly lines: readonly PurchaseDraftLineWithDrift[];
};

/** Whether this line carries the Customer destination it ships to — the one discriminator, so no
 * caller tests for a property name of its own. It **fails closed**: a line the redacted query
 * produced has no such property, and a mapper handed one can therefore only produce the redacted
 * shape (AC-09a). */
export const identifiesCustomer = (
  line: PurchaseDraftLineWithDrift,
): line is PurchaseDraftLineIdentifiedWithDrift =>
  'customerDestination' in line;

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

      if (redacted === null) {
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

    if (identified === null) {
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
