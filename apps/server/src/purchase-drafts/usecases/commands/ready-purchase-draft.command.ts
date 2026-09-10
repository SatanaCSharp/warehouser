import { Injectable, Optional } from '@nestjs/common';
import { assert, assertFail } from '@warehouser/utils/asserts';
import type { DisagreeingDeliveryLink } from 'purchase-drafts/domain/errors/purchase-draft.errors.js';
import {
  purchaseDraftConcurrentChangeError,
  purchaseDraftDeliveryAddressDisagreementError,
  purchaseDraftEmptyError,
  purchaseDraftInvalidStateError,
  purchaseDraftTargetUnavailableError,
  purchaseDraftWarehouseDeliveryAddressRequiredError,
} from 'purchase-drafts/domain/errors/purchase-draft.errors.js';
import {
  isDiscardableDraft,
  isEmptyDraft,
} from 'purchase-drafts/domain/predicates/purchase-draft-freeze.predicates.js';
import { PurchaseDraftAssemblyService } from 'purchase-drafts/domain/services/purchase-draft-assembly.service.js';
import { DeliveryMode } from 'purchase-drafts/domain/value-objects/delivery-mode.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import { Transactional } from 'shared/decorators/transactional.decorator.js';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository.js';
import { PurchaseDraftFreezeRepository } from 'shared/domain/repositories/purchase-draft-freeze.repository.js';

/** Where one line's goods travel, as the freeze reads it off the line. */
interface FreezableLine {
  readonly id: string;
  readonly deliveryMode: DeliveryMode;
  readonly customerDeliveryAddressId: string | null;
}

// AC-16a — the freeze precondition, stated as a pure condition over the two things it is about: how
// this draft's lines travel, and whether the Warehouse has an address at all. Kept beside its one
// implementation rather than promoted to `domain/predicates/` (server-error-handling.md §1) — the
// freeze is the only moment it applies, which is exactly what makes it a **freeze precondition and
// not a line-level one**: a line coming to the dock is composed, revised and linked perfectly well
// while the Warehouse has no address, and only the statement made to the supplier requires one.
const warehouseAddressCoversEveryViaWarehouseLine = (
  lines: readonly FreezableLine[],
  warehouseDeliveryAddressText: string | null,
): boolean =>
  warehouseDeliveryAddressText !== null ||
  !lines.some((line) => line.deliveryMode === DeliveryMode.ViaWarehouse);

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
    private readonly assemblyService: PurchaseDraftAssemblyService,
    @Optional()
    private readonly runtime: ReadyPurchaseDraftRuntime = defaultReadyPurchaseDraftRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
  ): Promise<FrozenPurchaseDraft> {
    // Authority itself is not decided here — `freeze`'s guarded `UPDATE` carries `warehouse_id` in
    // its own `WHERE` clause. This read only chooses which refusal is owed and cannot become a
    // check-then-write window.
    const header = await this.freezeRepository.findDraftHeader(purchaseDraftId);
    assert(
      header !== null && header.warehouseId === currentUser.warehouseId,
      purchaseDraftTargetUnavailableError(),
    );

    assert(isDiscardableDraft(header.state), purchaseDraftInvalidStateError());

    // AC-14a — readiness requires the draft to hold at least one line; checked before any write.
    const lines = await this.assemblyRepository.findLines(purchaseDraftId);
    assert(!isEmptyDraft(lines.length), purchaseDraftEmptyError());

    // AC-16a — a line coming to the warehouse cannot be frozen before the warehouse has an address
    // to be delivered to; the refusal names the capability that records one.
    assert(
      warehouseAddressCoversEveryViaWarehouseLine(
        lines,
        header.warehouseDeliveryAddressText,
      ),
      purchaseDraftWarehouseDeliveryAddressRequiredError(),
    );

    // AC-15a — the third moment the direct-line agreement is required, asked through the same
    // shared read the link and revision commands ask it through, with no prospective link: the
    // freeze judges the links the line already has. Every disagreement across every line is named
    // at once and none is withdrawn, because which link to withdraw is the member's decision.
    const scope = { purchaseDraftId, warehouseId: currentUser.warehouseId };
    const disagreeingLinks: DisagreeingDeliveryLink[] = [];
    for (const line of lines) {
      disagreeingLinks.push(
        ...(await this.assemblyService.findDisagreeingLinks(scope, line.id, {
          deliveryMode: line.deliveryMode,
          customerDeliveryAddressId: line.customerDeliveryAddressId,
        })),
      );
    }
    if (disagreeingLinks.length > 0) {
      assertFail(
        purchaseDraftDeliveryAddressDisagreementError(disagreeingLinks),
      );
    }

    const readiedAt = this.runtime.now();
    const frozen = await this.freezeRepository.freeze({
      purchaseDraftId,
      warehouseId: currentUser.warehouseId,
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
