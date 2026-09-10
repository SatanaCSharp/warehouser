import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import {
  purchaseDraftConcurrentChangeError,
  purchaseDraftInvalidStateError,
  purchaseDraftTargetUnavailableError,
} from 'purchase-drafts/domain/errors/purchase-draft.errors.js';
import { isReadyForOrderingDraft } from 'purchase-drafts/domain/predicates/purchase-draft-freeze.predicates.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import { Transactional } from 'shared/decorators/transactional.decorator.js';
import { PurchaseDraftFreezeRepository } from 'shared/domain/repositories/purchase-draft-freeze.repository.js';

export interface ClosePurchaseDraftRuntime {
  readonly now: () => Date;
}

const defaultClosePurchaseDraftRuntime: ClosePurchaseDraftRuntime = {
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

// AC-21 — closing a frozen draft with a reason. It shares `ready-purchase-draft.command.ts`'s
// pre-read disambiguation between `invalid_state` and `concurrent_change` (sad.md §6.11/§8), and
// lets a refusal propagate unwrapped to the global exception filter.
//
// The constructor parameter is typed as the concrete repository, not a `Pick<Repository,
// 'method'>` structural subset: `emitDecoratorMetadata` erases a mapped/utility type to `Object`,
// which Nest's DI container cannot resolve (`usecase.module.di.spec.ts` proves the module boots
// through real injection, not just `new`).
@Injectable()
export class ClosePurchaseDraftCommand {
  constructor(
    private readonly closureRepository: PurchaseDraftFreezeRepository,
    @Optional()
    private readonly runtime: ClosePurchaseDraftRuntime = defaultClosePurchaseDraftRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    input: CloseDraftInput,
  ): Promise<ClosedPurchaseDraft> {
    // Authority itself is not decided here — `close`'s guarded `UPDATE` carries `warehouse_id` in
    // its own `WHERE` clause. This read only chooses which refusal is owed and cannot become a
    // check-then-write window.
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
      warehouseId: currentUser.warehouseId,
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
}
