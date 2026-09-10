import type {
  ArrivalAllocationRead,
  DemandSnapshotRedactedRead,
  LinkedCustomerOrderStateRedactedRead,
  PurchaseDraftLineLinkIdentifiedRead,
  PurchaseDraftLineLinkRedactedRead,
} from 'shared/domain/repositories/purchase-draft-read.repository.js';

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

// AC-16/AC-18 — one link's Drift Signals, derived as a value comparison between `snapshot` and
// `current` and nothing else, so a value amended and then put back as it was reports no drift
// (openapi.yaml `DriftSignalKind`). `became_fulfilled` means the linked order was Fulfilled through
// the arrival of a *different* draft; a non-null `allocation` is this draft's own Arrival
// Confirmation having fulfilled it, so that case is suppressed rather than named as drift.
//
// `delivery_address_changed` is Address Drift, and it compares the captured **identifier** rather
// than the captured text: correcting a typo in an address that was never redirected is not a
// redirection and reports nothing, while redirecting the order back to the address frozen for it
// stops the report — because there is no stored verdict to keep reporting, only the two values
// (AC-18, AC-18a, data-model.md `purchase_draft_demand_snapshots`).
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

  const signals: DriftSignalKind[] = [];

  if (current.state === 'cancelled' && snapshot.capturedState !== 'cancelled') {
    signals.push('cancelled');
  }
  if (current.quantity !== snapshot.capturedQuantity) {
    signals.push('quantity_changed');
  }
  if (current.neededBy !== snapshot.capturedNeededBy) {
    signals.push('needed_by_moved');
  }
  if (
    current.state === 'fulfilled' &&
    snapshot.capturedState !== 'fulfilled' &&
    allocation === null
  ) {
    signals.push('became_fulfilled');
  }
  if (addressDrift) {
    signals.push('delivery_address_changed');
  }

  return signals;
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
