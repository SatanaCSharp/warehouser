import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import { DemandAllocationService } from 'customer-orders/domain/services/demand-allocation.service';
import { purchaseDraftConcurrentChangeError } from 'purchase-drafts/domain/errors/purchase-draft.errors';
import type { EndingPreReceiptConformanceInput } from 'purchase-drafts/domain/mappers/purchase-draft-line-ending.mapper';
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
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import type { RecordLineEndingRejectionInput } from 'shared/domain/repositories/arrival-confirmation.repository';
import { ArrivalConfirmationRepository } from 'shared/domain/repositories/arrival-confirmation.repository';

export interface EndingAllocationInput {
  readonly purchaseDraftLineLinkId: string;
  readonly allocatedQuantity: number;
}

export interface ConfirmPurchaseDraftLineArrivalInput {
  readonly receivedQuantity: number;
  // T13 — re-narrowed from T10's `unknown` now that the REST boundary parses a request body against
  // `@warehouser/contracts/purchase-drafts` before this command ever sees it: `tsc`, rather than a
  // runtime assertion, is what now proves the controller passes the parsed DTO. Both remain
  // optional and default to "nothing refused, nothing judged" (sad.md §6.1 step 1's "opening at
  // presented, none refused, all presented accepted"), so a caller stating only `receivedQuantity`
  // still submits a legal, refusal-free ending.
  readonly rejections?: readonly RecordLineEndingRejectionInput[];
  readonly preReceiptConformance?: EndingPreReceiptConformanceInput | null;
  readonly allocations: readonly EndingAllocationInput[];
}

export interface PurchaseDraftLineEnded {
  readonly id: string;
  readonly state: 'ready_for_ordering' | 'closed';
  readonly purchaseDraftLineId: string;
  readonly endingRecordedByUserId: string;
  readonly endingRecordedAt: Date;
}

export interface PurchaseDraftLineEndingRuntime {
  readonly now: () => Date;
}

const defaultPurchaseDraftLineEndingRuntime: PurchaseDraftLineEndingRuntime = {
  now: () => new Date(),
};

// AC-19/AC-20/AC-20a/AC-21 — the **Via Warehouse** half of the per-line ending (ADR 0002). What
// arrived at the dock on one line, assigned across that line's linked Customer Orders.
//
// The kind is the route, not the payload: this command records an `arrival` and nothing else, so a
// member aiming it at a Direct to Customer line is refused by `assertAdmitsEnding`
// before any write, rather than after submitting a value (openapi.yaml — "making the ending kind a
// payload field instead would put that refusal behind a value the member submitted").
//
// One `@Transactional()` boundary owns the whole act, in the fixed lock order sad.md §8 established
// and §6.10 extends to this second write path: the draft row, then its line, then the linked
// Customer Orders in ascending identifier order inside `DemandAllocationService`. The ending, every
// Allocation made from it and the draft's closure land together or not at all (spec.md §6 "Ending
// atomicity").
//
// No Item's On-hand Quantity is written here or in the service it delegates to — it moves only
// through an adjustment that states its reason (AC-21).
//
// `DemandAllocationService` and `ArrivalInspectionService` are both required constructor
// collaborators (server-architecture.md §118 "every constructor parameter is used by the body"):
// the catalogue check they wire in is one of the rules every submission runs, never an optional
// extra a caller may omit. Unit tests exercise the **real** `ArrivalInspectionService` with a
// catalogue-repository double beneath it (server-architecture.md §216-218), never a double of the
// service itself.
@Injectable()
export class ConfirmPurchaseDraftLineArrivalCommand {
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
    input: ConfirmPurchaseDraftLineArrivalInput,
  ): Promise<PurchaseDraftLineEnded> {
    const locked =
      await this.arrivalConfirmationRepository.lockDraftLineForEnding(
        purchaseDraftId,
        purchaseDraftLineId,
        currentUser.warehouseId,
      );

    assertAdmitsEnding(locked, EndingKind.Arrival);

    const submission = toEndingConditionSubmission(
      input.receivedQuantity,
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
      endingQuantity: input.receivedQuantity,
      endingKind: EndingKind.Arrival,
      endingRecordedByUserId: currentUser.userId,
      endingRecordedAt,
      condition: buildEndingConditionInput(submission),
    });
    // A pre-read that resolved legally but whose guarded write still affected zero rows is the
    // concurrency answer, distinct from the AC-20a refusal above (server-error-handling.md §3).
    assert(written.recorded, purchaseDraftConcurrentChangeError());

    // Delegated only after the ending is written, so the bounds AC-18 re-checks are evaluated
    // against rows this same transaction already holds. Bounded by the derived Accepted Quantity
    // rather than by what was presented (AC-01/AC-11).
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
