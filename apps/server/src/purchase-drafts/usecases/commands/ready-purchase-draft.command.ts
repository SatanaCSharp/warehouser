import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import {
  purchaseDraftConcurrentChangeError,
  purchaseDraftEmptyError,
  purchaseDraftInvalidStateError,
  purchaseDraftTargetUnavailableError,
} from 'purchase-drafts/domain/errors/purchase-draft.errors';
import {
  isDiscardableDraft,
  isEmptyDraft,
} from 'purchase-drafts/domain/predicates/purchase-draft-freeze.predicates';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';
import { PurchaseDraftFreezeRepository } from 'shared/domain/repositories/purchase-draft-freeze.repository';

export interface ReadyPurchaseDraftRuntime {
  readonly now: () => Date;
}

const defaultReadyPurchaseDraftRuntime: ReadyPurchaseDraftRuntime = {
  now: () => new Date(),
};

export interface FrozenPurchaseDraft {
  readonly id: string;
  readonly state: 'ready_for_ordering';
  readonly readiedByUserId: string;
  readonly readiedAt: Date;
}

// AC-14/AC-14a — moving a draft to Ready for Ordering. The coordinator's disambiguation rule: a
// pre-read `null`/cross-Warehouse header is the non-enumerating unavailable outcome; a pre-read
// state other than `draft` is `invalid_state` (the guarded write is never attempted); a pre-read
// state of `draft` whose guarded write still affects zero rows is `concurrent_change` — the loser
// of a genuine race, never merged (sad.md §8/§6.7).
//
// The constructor parameters are typed as the concrete repositories, not a `Pick<Repository,
// 'method'>` structural subset: `emitDecoratorMetadata` erases a mapped/utility type to `Object`,
// which Nest's DI container cannot resolve (`usecase.module.di.spec.ts` proves the module boots
// through real injection, not just `new`).
@Injectable()
export class ReadyPurchaseDraftCommand {
  constructor(
    private readonly freezeRepository: PurchaseDraftFreezeRepository,
    private readonly assemblyRepository: PurchaseDraftAssemblyRepository,
    @Optional()
    private readonly runtime: ReadyPurchaseDraftRuntime = defaultReadyPurchaseDraftRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
  ): Promise<FrozenPurchaseDraft> {
    const header = await this.freezeRepository.findDraftHeader(purchaseDraftId);
    assert(
      header !== null && header.warehouseId === currentUser.warehouseId,
      purchaseDraftTargetUnavailableError(),
    );

    assert(isDiscardableDraft(header.state), purchaseDraftInvalidStateError());

    // AC-14a — readiness requires the draft to hold at least one line; checked before any write.
    const lines = await this.assemblyRepository.findLines(purchaseDraftId);
    assert(!isEmptyDraft(lines.length), purchaseDraftEmptyError());

    const readiedAt = this.runtime.now();
    const frozen = await this.freezeRepository.freeze({
      purchaseDraftId,
      readiedByUserId: currentUser.userId,
      readiedAt,
    });
    assert(frozen, purchaseDraftConcurrentChangeError());

    return {
      id: purchaseDraftId,
      state: 'ready_for_ordering',
      readiedByUserId: currentUser.userId,
      readiedAt,
    };
  }
}
