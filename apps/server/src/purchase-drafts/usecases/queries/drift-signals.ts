import type {
  ArrivalAllocationRead,
  DemandSnapshotRedactedRead,
  LinkedCustomerOrderStateRedactedRead,
  PurchaseDraftLineLinkIdentifiedRead,
  PurchaseDraftLineLinkRedactedRead,
} from 'shared/domain/repositories/purchase-draft-read.repository';

// openapi.yaml `DriftSignalKind`.
export type DriftSignalKind =
  | 'cancelled'
  | 'quantity_changed'
  | 'needed_by_moved'
  | 'became_fulfilled'
  | 'delivery_address_changed';

// The derived half every link carries whichever form it is served in.
interface WithDriftSignals {
  readonly driftSignals: readonly DriftSignalKind[];
}

// openapi.yaml `PurchaseDraftLineLinkRedacted`/`PurchaseDraftLineLinkIdentified` — the repository's
// raw comparison inputs plus the derived `driftSignals` this layer attaches. Both forms carry the
// signals: **that** an address drift exists is a fact about the draft rather than customer
// identity, so withholding it would tell an entitled member less than AC-18a promises (AC-09a).
export type PurchaseDraftLineLinkRedactedWithDrift =
  PurchaseDraftLineLinkRedactedRead & WithDriftSignals;

export type PurchaseDraftLineLinkIdentifiedWithDrift =
  PurchaseDraftLineLinkIdentifiedRead & WithDriftSignals;

// One link's two sides of the comparison, bundled so every rule below reads the same shape and the
// rule table can hold them all under one signature.
interface DriftComparison {
  readonly snapshot: DemandSnapshotRedactedRead;
  readonly current: LinkedCustomerOrderStateRedactedRead;
  readonly allocation: ArrivalAllocationRead | null;
  readonly addressDrift: boolean;
}

const becameCancelled = ({ snapshot, current }: DriftComparison): boolean =>
  current.state === 'cancelled' && snapshot.capturedState !== 'cancelled';

const quantityChanged = ({ snapshot, current }: DriftComparison): boolean =>
  current.quantity !== snapshot.capturedQuantity;

const neededByMoved = ({ snapshot, current }: DriftComparison): boolean =>
  current.neededBy !== snapshot.capturedNeededBy;

// `became_fulfilled` means the linked order was Fulfilled through the arrival of a *different*
// draft; a non-null `allocation` is this draft's own Arrival Confirmation having fulfilled it, so
// that case is suppressed rather than named as drift.
const becameFulfilledElsewhere = ({
  snapshot,
  current,
  allocation,
}: DriftComparison): boolean =>
  current.state === 'fulfilled' &&
  snapshot.capturedState !== 'fulfilled' &&
  allocation === null;

// Address Drift, already decided by the repository as a comparison of the captured **identifier**
// rather than the captured text: correcting a typo in an address that was never redirected is not a
// redirection and reports nothing, while redirecting the order back to the address frozen for it
// stops the report — because there is no stored verdict to keep reporting, only the two values
// (AC-18, AC-18a, data-model.md `purchase_draft_demand_snapshots`).
const addressRedirected = ({ addressDrift }: DriftComparison): boolean =>
  addressDrift;

// The signals in the order a link reports them. A table rather than a chain of `if`s so that each
// rule is one named condition that can be read — and tested — on its own, and so that adding a
// sixth signal costs a row instead of another branch in one function
// (server-error-handling.md §1).
const DRIFT_RULES: readonly (readonly [
  DriftSignalKind,
  (comparison: DriftComparison) => boolean,
])[] = [
  ['cancelled', becameCancelled],
  ['quantity_changed', quantityChanged],
  ['needed_by_moved', neededByMoved],
  ['became_fulfilled', becameFulfilledElsewhere],
  ['delivery_address_changed', addressRedirected],
];

// AC-16/AC-18 — one link's Drift Signals, derived as a value comparison between `snapshot` and
// `current` and nothing else, so a value amended and then put back as it was reports no drift
// (openapi.yaml `DriftSignalKind`).
//
// A pure function shared by every read that projects a link, so the opened draft and the by-line
// view can never name a different signal for one link. It is not a use case: nothing wraps an
// `execute` here (server-use-case-boundaries.md).
export const driftSignalsOf = (
  snapshot: DemandSnapshotRedactedRead | null,
  current: LinkedCustomerOrderStateRedactedRead,
  allocation: ArrivalAllocationRead | null,
  addressDrift: boolean,
): DriftSignalKind[] => {
  if (snapshot === null) {
    return [];
  }

  const comparison: DriftComparison = {
    snapshot,
    current,
    allocation,
    addressDrift,
  };

  return DRIFT_RULES.filter(([, drifted]) => drifted(comparison)).map(
    ([kind]) => kind,
  );
};

// The one place a raw link becomes a link carrying its Drift Signals. Generic over the two
// projection forms, so the redacted and identified reads derive the same signals from the same
// comparison and neither can name a signal the other does not.
export const withDriftSignals = <T extends PurchaseDraftLineLinkRedactedRead>(
  link: T,
): T & WithDriftSignals => ({
  ...link,
  driftSignals: driftSignalsOf(
    link.snapshot,
    link.current,
    link.allocation,
    link.addressDrift,
  ),
});
