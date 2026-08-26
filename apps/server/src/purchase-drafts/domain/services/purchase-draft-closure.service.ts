import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import {
  purchaseDraftConcurrentChangeError,
  purchaseDraftDiscardUnavailableError,
  purchaseDraftInvalidStateError,
  purchaseDraftTargetUnavailableError,
} from 'purchase-drafts/domain/errors/purchase-draft.errors';
import { isReadyForOrderingDraft } from 'purchase-drafts/domain/predicates/purchase-draft-freeze.predicates';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import type { PurchaseDraftFreezeRepository } from 'shared/domain/repositories/purchase-draft-freeze.repository';

export interface PurchaseDraftClosureRuntime {
  readonly now: () => Date;
}

const defaultPurchaseDraftClosureRuntime: PurchaseDraftClosureRuntime = {
  now: () => new Date(),
};

export interface CloseDraftInput {
  readonly closureReason: string;
}

export interface ClosedPurchaseDraft {
  readonly id: string;
  readonly state: 'closed';
  readonly closedByUserId: string;
  readonly closedAt: Date;
  readonly closureReason: string;
}

export interface DiscardedPurchaseDraft {
  readonly id: string;
  readonly state: 'discarded';
  readonly discardedByUserId: string;
  readonly discardedAt: Date;
}

// Only the single capability each collaborator actually provides.
type ClosureWrite = Pick<
  PurchaseDraftFreezeRepository,
  'findDraftHeader' | 'close' | 'discard'
>;

// AC-21/AC-24/AC-24a — closing a frozen draft with a reason, or discarding one never made ready.
// `close` shares the freeze service's pre-read disambiguation between `invalid_state` and
// `concurrent_change` (sad.md §6.11/§8). `discard` resolves through the different
// `PurchaseDraftWriteConflict` schema, which carries no `concurrent_change` example, so a lost
// guarded write there is always `discard_unavailable`, deliberately without a pre-read.
@Injectable()
export class PurchaseDraftClosureService {
  constructor(
    private readonly closureRepository: ClosureWrite,
    @Optional()
    private readonly runtime: PurchaseDraftClosureRuntime = defaultPurchaseDraftClosureRuntime,
  ) {}

  @Transactional()
  async close(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    input: CloseDraftInput,
  ): Promise<ClosedPurchaseDraft> {
    const header =
      await this.closureRepository.findDraftHeader(purchaseDraftId);
    assert(
      header !== null && header.warehouseId === currentUser.warehouseId,
      purchaseDraftTargetUnavailableError(),
    );

    assert(
      isReadyForOrderingDraft(header.state),
      purchaseDraftInvalidStateError(),
    );

    const closedAt = this.runtime.now();
    const closed = await this.closureRepository.close({
      purchaseDraftId,
      closedByUserId: currentUser.userId,
      closedAt,
      closureReason: input.closureReason,
    });
    assert(closed, purchaseDraftConcurrentChangeError());

    return {
      id: purchaseDraftId,
      state: 'closed',
      closedByUserId: currentUser.userId,
      closedAt,
      closureReason: input.closureReason,
    };
  }

  // AC-24/AC-24a — deliberately no pre-read here: a lost guarded write is always
  // `discard_unavailable`, never `concurrent_change` (`PurchaseDraftWriteConflict` carries no
  // `concurrent_change` example).
  @Transactional()
  async discard(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
  ): Promise<DiscardedPurchaseDraft> {
    const discardedAt = this.runtime.now();
    const discarded = await this.closureRepository.discard({
      purchaseDraftId,
      discardedByUserId: currentUser.userId,
      discardedAt,
    });
    assert(discarded, purchaseDraftDiscardUnavailableError());

    return {
      id: purchaseDraftId,
      state: 'discarded',
      discardedByUserId: currentUser.userId,
      discardedAt,
    };
  }
}
