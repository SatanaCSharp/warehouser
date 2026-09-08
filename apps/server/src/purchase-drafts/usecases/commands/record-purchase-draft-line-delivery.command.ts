import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import { DemandAllocationService } from 'customer-orders/domain/services/demand-allocation.service';
import { purchaseDraftConcurrentChangeError } from 'purchase-drafts/domain/errors/purchase-draft.errors';
import {
  buildEndingConditionInput,
  toEndingConditionSubmission,
} from 'purchase-drafts/domain/mappers/purchase-draft-line-ending.mapper';
import {
  ArrivalInspectionService,
  deriveAcceptedQuantity,
  deriveRejectedQuantity,
} from 'purchase-drafts/domain/services/arrival-inspection.service';
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

// T10 — the `rejections`/`preReceiptConformance` fields are loosely typed for the same reason
// `ConfirmPurchaseDraftLineArrivalInput`'s are: the REST boundary narrows a request body to its real
// shape, and this command trusts that shape once, in `toEndingConditionSubmission`.
export interface RecordPurchaseDraftLineDeliveryInput {
  readonly deliveredQuantity: number;
  readonly rejections?: readonly unknown[];
  readonly preReceiptConformance?: unknown;
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
//   actually happened. It feeds the same `EndingConditionSubmission.receivedQuantity` field and the
//   same demand delegation the arrival half uses: the demand effect is the same act — this much of
//   the line's goods reached the named customers — whichever way they travelled.
// - The goods never entered the building, so they were never in the Transit Zone to be counted, and
//   no Item's On-hand Quantity moves here for a second, independent reason (AC-21).
//
// T10/AC-24/AC-25 — the Condition Split's Source rule mirrors here through the locked line's own
// Delivery Mode: a Rejection on this line must carry the customer-reported Source, never the
// inspected one, exactly as `sourceMatchesDeliveryMode`/`requiredSourceFor` already state it. Nothing
// here re-decides that; it is the same `assertConditionSplit` the arrival half calls, judged against
// this line's own `deliveryMode` (sad.md §6.2 step 3).
//
// This release provides no proof that a Direct Delivery happened and the system does not inspect
// what is recorded (spec.md §3, CONTEXT.md "Direct Delivery").
@Injectable()
export class RecordPurchaseDraftLineDeliveryCommand {
  constructor(
    private readonly arrivalConfirmationRepository: ArrivalConfirmationRepository,
    private readonly demandAllocationService: DemandAllocationService,
    private readonly arrivalInspectionService: ArrivalInspectionService,
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

    const submission = toEndingConditionSubmission(
      input.deliveredQuantity,
      input.rejections,
      input.preReceiptConformance,
    );

    await this.arrivalInspectionService.assertEndingCondition(
      currentUser,
      locked.line,
      submission,
    );

    const acceptedQuantity = deriveAcceptedQuantity(submission);
    const endingRecordedAt = this.runtime.now();

    const written = await this.arrivalConfirmationRepository.recordLineEnding({
      purchaseDraftId,
      purchaseDraftLineId,
      warehouseId: currentUser.warehouseId,
      endingQuantity: input.deliveredQuantity,
      endingKind: EndingKind.DirectDelivery,
      endingRecordedByUserId: currentUser.userId,
      endingRecordedAt,
      condition: buildEndingConditionInput(submission),
    });
    assert(written.recorded, purchaseDraftConcurrentChangeError());

    await this.demandAllocationService.allocate(
      currentUser.warehouseId,
      currentUser.userId,
      [
        {
          purchaseDraftLineId,
          assignableQuantity: acceptedQuantity,
          rejectedQuantity: deriveRejectedQuantity(submission),
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
