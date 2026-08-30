import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import { purchaseDraftDiscardUnavailableError } from 'purchase-drafts/domain/errors/purchase-draft.errors';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { PurchaseDraftFreezeRepository } from 'shared/domain/repositories/purchase-draft-freeze.repository';

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
// `concurrent_change` example, so a lost guarded write here is always `discard_unavailable` —
// which is why there is deliberately no pre-read.
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
