import { Injectable } from '@nestjs/common';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type {
  ArrivalAllocationRead,
  DemandSnapshotRead,
  LinkedCustomerOrderStateRead,
  PurchaseDraftDetailRead,
  PurchaseDraftLineLinkRead,
  PurchaseDraftLineRead,
} from 'shared/domain/repositories/purchase-draft-read.repository';
import { PurchaseDraftReadRepository } from 'shared/domain/repositories/purchase-draft-read.repository';

// openapi.yaml `DriftSignalKind`.
type DriftSignalKind =
  'cancelled' | 'quantity_changed' | 'needed_by_moved' | 'became_fulfilled';

// AC-16 — one link's Drift Signals, derived as a value comparison between `snapshot` and `current`
// and nothing else, so a value amended and then put back as it was reports no drift (openapi.yaml
// `DriftSignalKind`). `became_fulfilled` means the linked order was Fulfilled through the arrival
// of a *different* draft; a non-null `allocation` is this draft's own Arrival Confirmation having
// fulfilled it, so that case is suppressed rather than named as drift.
const driftSignalsOf = (
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

  return signals;
};

// openapi.yaml `PurchaseDraftLineLink` — the repository's raw comparison inputs plus the derived
// `driftSignals` this use case attaches.
export type PurchaseDraftLineLinkWithDrift = PurchaseDraftLineLinkRead & {
  readonly driftSignals: readonly DriftSignalKind[];
};

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

// AC-16 — the application boundary of reading one draft with its per-link Drift Signals derived
// (server-architecture.md §Dependency direction, §Use cases). The repository hands back the raw
// snapshot/current comparison inputs only; naming the Drift Signal is this use case's own business
// decision.
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
        links: line.links.map((link): PurchaseDraftLineLinkWithDrift => ({
          ...link,
          driftSignals: driftSignalsOf(
            link.snapshot,
            link.current,
            link.allocation,
          ),
        })),
      })),
    };
  }
}
