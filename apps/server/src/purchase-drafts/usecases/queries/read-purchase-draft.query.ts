import { Injectable } from '@nestjs/common';
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
  'links'
> & {
  readonly links: readonly PurchaseDraftLineLinkRedactedWithDrift[];
};

// openapi.yaml `PurchaseDraftLineIdentified` with the same signals derived.
export type PurchaseDraftLineIdentifiedWithDrift = Omit<
  PurchaseDraftLineIdentifiedRead,
  'links'
> & {
  readonly links: readonly PurchaseDraftLineLinkIdentifiedWithDrift[];
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
@Injectable()
export class ReadPurchaseDraftQuery {
  constructor(private readonly repository: PurchaseDraftReadRepository) {}

  async execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
  ): Promise<PurchaseDraftDetailWithDrift | null> {
    // Two branches rather than one read behind a flag, following `ReadCustomerOrderQuery`'s (T13)
    // shape: each names the query it issues, so "the redacted form selects no identity column" is
    // readable at the call site rather than hidden in a parameter.
    if (!readsCustomerIdentity(currentUser.observedPermissionIds)) {
      const redacted = await this.repository.readRedactedDraft(
        purchaseDraftId,
        currentUser.warehouseId,
      );

      return redacted === null
        ? null
        : {
            ...redacted,
            lines: redacted.lines.map((line) => ({
              ...line,
              links: line.links.map(withDriftSignals),
            })),
          };
    }

    const identified = await this.repository.readIdentifiedDraft(
      purchaseDraftId,
      currentUser.warehouseId,
    );

    return identified === null
      ? null
      : {
          ...identified,
          lines: identified.lines.map((line) => ({
            ...line,
            links: line.links.map(withDriftSignals),
          })),
        };
  }
}
