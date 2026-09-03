import type {
  ArrivalAllocationRead,
  DemandSnapshotRead,
  LinkedCustomerOrderStateRead,
  PurchaseDraftLineLinkRead,
} from 'shared/domain/repositories/purchase-draft-read.repository';

// openapi.yaml `DriftSignalKind`.
export type DriftSignalKind =
  | 'cancelled'
  | 'quantity_changed'
  | 'needed_by_moved'
  | 'became_fulfilled'
  | 'delivery_address_changed';

// openapi.yaml `PurchaseDraftLineLink` — the repository's raw comparison inputs plus the derived
// `driftSignals` the query layer attaches.
export type PurchaseDraftLineLinkWithDrift = PurchaseDraftLineLinkRead & {
  readonly driftSignals: readonly DriftSignalKind[];
};

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
  snapshot: DemandSnapshotRead | null,
  current: LinkedCustomerOrderStateRead,
  allocation: ArrivalAllocationRead | null,
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
  if (
    (current.deliveryAddress?.deliveryAddressId ?? null) !==
    snapshot.capturedDeliveryAddressId
  ) {
    signals.push('delivery_address_changed');
  }

  return signals;
};

// The one place a raw link becomes a link carrying its Drift Signals.
export const withDriftSignals = (
  link: PurchaseDraftLineLinkRead,
): PurchaseDraftLineLinkWithDrift => ({
  ...link,
  driftSignals: driftSignalsOf(link.snapshot, link.current, link.allocation),
});
