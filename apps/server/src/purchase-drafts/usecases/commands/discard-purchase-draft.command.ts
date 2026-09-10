import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import {
  purchaseDraftDiscardUnavailableError,
  purchaseDraftTargetUnavailableError,
} from 'purchase-drafts/domain/errors/purchase-draft.errors.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import { Transactional } from 'shared/decorators/transactional.decorator.js';
import { PurchaseDraftFreezeRepository } from 'shared/domain/repositories/purchase-draft-freeze.repository.js';

export interface DiscardPurchaseDraftRuntime {
  readonly now: () => Date;
}

const defaultDiscardPurchaseDraftRuntime: DiscardPurchaseDraftRuntime = {
  now: () => new Date(),
};

export interface DiscardedPurchaseDraft {
  readonly id: string;
  readonly state: 'discarded';
  readonly discardedByUserId: string;
  readonly discardedAt: Date;
}

// AC-24/AC-24a — discarding a draft never made ready. Unlike `close-purchase-draft.command.ts`
// this resolves through the different `PurchaseDraftWriteConflict` schema, which carries no
// `concurrent_change` example, so a lost guarded write here is always `discard_unavailable` and
// the pre-read below deliberately does not re-decide the *state*.
//
// What it does decide is the same thing `ready-purchase-draft.command.ts` and
// `close-purchase-draft.command.ts` decide from their own pre-read, and for the same reason: a
// draft this Warehouse does not hold, and a draft id that names nothing, are one non-enumerating
// `purchase_drafts.target_unavailable` (openapi.yaml `PurchaseDraftUnavailable` on `DELETE
// /purchase-drafts/{id}`, spec.md §6.1) rather than the 409 a member of the owning Warehouse would
// see. Authority itself is not decided here — `discard`'s guarded `UPDATE` carries `warehouse_id`
// in its own `WHERE` clause, so this read only chooses which refusal is owed and cannot become a
// check-then-write window.
@Injectable()
export class DiscardPurchaseDraftCommand {
  constructor(
    private readonly closureRepository: PurchaseDraftFreezeRepository,
    @Optional()
    private readonly runtime: DiscardPurchaseDraftRuntime = defaultDiscardPurchaseDraftRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
  ): Promise<DiscardedPurchaseDraft> {
    const header =
      await this.closureRepository.findDraftHeader(purchaseDraftId);
    assert(
      header !== null && header.warehouseId === currentUser.warehouseId,
      purchaseDraftTargetUnavailableError(),
    );

    const discardedAt = this.runtime.now();
    const discarded = await this.closureRepository.discard({
      purchaseDraftId,
      warehouseId: currentUser.warehouseId,
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
