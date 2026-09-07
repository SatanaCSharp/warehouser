import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import { DemandAllocationService } from 'customer-orders/domain/services/demand-allocation.service';
import { purchaseDraftConcurrentChangeError } from 'purchase-drafts/domain/errors/purchase-draft.errors';
import { assertAdmitsEnding } from 'purchase-drafts/domain/services/purchase-draft-line-ending.service';
import { EndingKind } from 'purchase-drafts/domain/value-objects/delivery-mode';
import type {
  EndingAllocationInput,
  PurchaseDraftLineEnded,
  PurchaseDraftLineEndingRuntime,
} from 'purchase-drafts/usecases/commands/confirm-purchase-draft-line-arrival.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { ArrivalConfirmationRepository } from 'shared/domain/repositories/arrival-confirmation.repository';

export interface RecordPurchaseDraftLineDeliveryInput {
  readonly deliveredQuantity: number;
  readonly allocations: readonly EndingAllocationInput[];
}

const defaultPurchaseDraftLineEndingRuntime: PurchaseDraftLineEndingRuntime = {
  now: () => new Date(),
};

// AC-19/AC-20/AC-20a/AC-21 — the **Direct to Customer** half of the per-line ending (ADR 0002).
// What the customer received on one line, as the member was told it.
//
// Everything the arrival half states about the transaction, the fixed lock order, the single-ending
// rule and the draft's closure on its last line holds here identically. Two differences, and both
// are deliberate:
//
// - The quantity is named `deliveredQuantity` rather than `receivedQuantity`, because it says what
//   actually happened. It is carried into `DemandAllocationService` through that service's own
//   `receivedQuantity` field: the demand effect is the same act — this much of the line's goods
//   reached the named customers — whichever way they travelled.
// - The goods never entered the building, so they were never in the Transit Zone to be counted, and
//   no Item's On-hand Quantity moves here for a second, independent reason (AC-21).
//
// This release provides no proof that a Direct Delivery happened and the system does not inspect
// what is recorded (spec.md §3, CONTEXT.md "Direct Delivery").
@Injectable()
export class RecordPurchaseDraftLineDeliveryCommand {
  constructor(
    private readonly arrivalConfirmationRepository: ArrivalConfirmationRepository,
    private readonly demandAllocationService: DemandAllocationService,
    @Optional()
    private readonly runtime: PurchaseDraftLineEndingRuntime = defaultPurchaseDraftLineEndingRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineId: string,
    input: RecordPurchaseDraftLineDeliveryInput,
  ): Promise<PurchaseDraftLineEnded> {
    const locked =
      await this.arrivalConfirmationRepository.lockDraftLineForEnding(
        purchaseDraftId,
        purchaseDraftLineId,
        currentUser.warehouseId,
      );

    assertAdmitsEnding(locked, EndingKind.DirectDelivery);

    const endingRecordedAt = this.runtime.now();

    const written = await this.arrivalConfirmationRepository.recordLineEnding({
      purchaseDraftId,
      purchaseDraftLineId,
      warehouseId: currentUser.warehouseId,
      endingQuantity: input.deliveredQuantity,
      endingKind: EndingKind.DirectDelivery,
      endingRecordedByUserId: currentUser.userId,
      endingRecordedAt,
      // T5 — this command states no condition yet; the Condition Split reaches it in its own task.
      condition: null,
    });
    assert(written.recorded, purchaseDraftConcurrentChangeError());

    await this.demandAllocationService.allocate(
      currentUser.warehouseId,
      currentUser.userId,
      [
        {
          purchaseDraftLineId,
          receivedQuantity: input.deliveredQuantity,
          allocations: input.allocations,
        },
      ],
    );

    return {
      id: purchaseDraftId,
      state: written.closed ? 'closed' : 'ready_for_ordering',
      purchaseDraftLineId,
      endingRecordedByUserId: currentUser.userId,
      endingRecordedAt,
    };
  }
}
