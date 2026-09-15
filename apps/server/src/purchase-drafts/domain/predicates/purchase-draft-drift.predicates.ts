import { isNull } from '@warehouser/utils/predicates';
import type {
  PurchaseDraftLineIdentifiedWithDrift,
  PurchaseDraftLineWithDrift,
} from 'purchase-drafts/domain/projections/purchase-draft-projection';
import type {
  ArrivalAllocationRead,
  DemandSnapshotRedactedRead,
  LinkedCustomerOrderStateRedactedRead,
} from 'shared/domain/repositories/purchase-draft-read.repository';

// Pure predicates for Purchase Draft link drift (server-error-handling.md §1). The types they read
// are imported type-only from `purchase-draft-projection.ts`, which imports these back as values —
// the edge that exists at runtime runs one way only, from the projection to here.

// One link's two sides of the comparison, bundled so every rule below reads the same shape and the
// projection's rule table can hold them all under one signature.
export interface DriftComparison {
  readonly snapshot: DemandSnapshotRedactedRead;
  readonly current: LinkedCustomerOrderStateRedactedRead;
  readonly allocation: ArrivalAllocationRead | null;
  readonly addressDrift: boolean;
}

export const becameCancelled = ({
  snapshot,
  current,
}: DriftComparison): boolean =>
  current.state === 'cancelled' && snapshot.capturedState !== 'cancelled';

export const quantityChanged = ({
  snapshot,
  current,
}: DriftComparison): boolean => current.quantity !== snapshot.capturedQuantity;

export const neededByMoved = ({
  snapshot,
  current,
}: DriftComparison): boolean => current.neededBy !== snapshot.capturedNeededBy;

// `became_fulfilled` means the linked order was Fulfilled through the arrival of a *different*
// draft; a non-null `allocation` is this draft's own Arrival Confirmation having fulfilled it, so
// that case is suppressed rather than named as drift.
export const becameFulfilledElsewhere = ({
  snapshot,
  current,
  allocation,
}: DriftComparison): boolean =>
  current.state === 'fulfilled' &&
  snapshot.capturedState !== 'fulfilled' &&
  isNull(allocation);

// Address Drift, already decided by the repository as a comparison of the captured **identifier**
// rather than the captured text: correcting a typo in an address that was never redirected is not a
// redirection and reports nothing, while redirecting the order back to the address frozen for it
// stops the report — because there is no stored verdict to keep reporting, only the two values
// (AC-18, AC-18a, data-model.md `purchase_draft_demand_snapshots`).
export const addressRedirected = ({ addressDrift }: DriftComparison): boolean =>
  addressDrift;

/** Whether this line carries the Customer destination it ships to — the one discriminator, so no
 * caller tests for a property name of its own. It **fails closed**: a line the redacted query
 * produced has no such property, and a mapper handed one can therefore only produce the redacted
 * shape (AC-09a). */
export const identifiesCustomer = (
  line: PurchaseDraftLineWithDrift,
): line is PurchaseDraftLineIdentifiedWithDrift =>
  'customerDestination' in line;
