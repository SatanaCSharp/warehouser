import { isNull } from '@warehouser/utils/predicates';
import type { PurchaseDraftLineEndingWithCondition } from 'purchase-drafts/domain/mappers/line-condition.mapper';
import type { DriftComparison } from 'purchase-drafts/domain/predicates/purchase-draft-drift.predicates';
import {
  addressRedirected,
  becameCancelled,
  becameFulfilledElsewhere,
  neededByMoved,
  quantityChanged,
} from 'purchase-drafts/domain/predicates/purchase-draft-drift.predicates';
import type {
  ArrivalAllocationRead,
  DemandSnapshotRedactedRead,
  LinkedCustomerOrderStateRedactedRead,
  PurchaseDraftLineIdentifiedRead,
  PurchaseDraftLineLinkIdentifiedRead,
  PurchaseDraftLineLinkRedactedRead,
  PurchaseDraftLineRedactedRead,
  PurchaseDraftSummaryRead,
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
  if (isNull(snapshot)) {
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
