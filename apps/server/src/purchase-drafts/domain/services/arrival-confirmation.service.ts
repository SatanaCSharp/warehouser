import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import type { DemandAllocationLineInput } from 'customer-orders/domain/services/demand-allocation.service';
import { DemandAllocationService } from 'customer-orders/domain/services/demand-allocation.service';
import {
  purchaseDraftArrivalAlreadyConfirmedError,
  purchaseDraftArrivalNoLinesError,
  purchaseDraftArrivalRepeatedLineError,
  purchaseDraftArrivalUnknownLineError,
  purchaseDraftConcurrentChangeError,
  purchaseDraftTargetUnavailableError,
} from 'purchase-drafts/domain/errors/purchase-draft.errors';
import {
  namesEachLineOnce,
  namesOnlyLinesOfTheDraft,
  recordsAtLeastOneLine,
} from 'purchase-drafts/domain/predicates/arrival-confirmation.predicates';
import { isReadyForOrderingDraft } from 'purchase-drafts/domain/predicates/purchase-draft-freeze.predicates';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { ArrivalConfirmationRepository } from 'shared/domain/repositories/arrival-confirmation.repository';

export interface ArrivalLineAllocationInput {
  readonly purchaseDraftLineLinkId: string;
  readonly allocatedQuantity: number;
}

export interface ArrivalLineInput {
  readonly purchaseDraftLineId: string;
  readonly receivedQuantity: number;
  readonly allocations: readonly ArrivalLineAllocationInput[];
}

export interface ConfirmedPurchaseDraft {
  readonly id: string;
  readonly state: 'closed';
  readonly arrivalConfirmedByUserId: string;
  readonly arrivalConfirmedAt: Date;
}

export interface ArrivalConfirmationRuntime {
  readonly now: () => Date;
}

const defaultArrivalConfirmationRuntime: ArrivalConfirmationRuntime = {
  now: () => new Date(),
};

// AC-17/AC-17a/AC-17b/AC-18/AC-18a — Arrival Confirmation. ADR 0002 places the whole operation on
// one `@Transactional()` boundary here: the draft row and its lines are read (data-model.md
// "Concurrency, locks and transactions" — the first two links of the fixed lock order), the
// coordinator's disambiguation rule applies exactly as `PurchaseDraftFreezeService` already draws it
// (T13, commit 4f380c0) — a pre-read state other than `ready_for_ordering` is
// `arrival_already_confirmed` (the guarded write is never attempted); a pre-read that resolves
// legally but whose guarded write still affects zero rows is `concurrent_change` — then every line's
// received quantity and the move to Closed are written together (`confirmArrival`), and only then is
// the demand effect delegated to the real `DemandAllocationService`, which locks the linked Customer
// Orders in ascending identifier order (sad.md §8, §11) and enforces AC-18's bounds against rows
// this same transaction holds. A failure anywhere rolls back everything (spec.md §6
// "Arrival atomicity").
@Injectable()
export class ArrivalConfirmationService {
  constructor(
    private readonly arrivalConfirmationRepository: ArrivalConfirmationRepository,
    private readonly demandAllocationService: DemandAllocationService,
    @Optional()
    private readonly runtime: ArrivalConfirmationRuntime = defaultArrivalConfirmationRuntime,
  ) {}

  @Transactional()
  async confirm(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    lines: readonly ArrivalLineInput[],
  ): Promise<ConfirmedPurchaseDraft> {
    const locked = await this.arrivalConfirmationRepository.lockDraftForArrival(
      purchaseDraftId,
      currentUser.warehouseId,
    );
    assert(locked.draft !== null, purchaseDraftTargetUnavailableError());

    assert(
      isReadyForOrderingDraft(locked.draft.state),
      purchaseDraftArrivalAlreadyConfirmedError(),
    );

    // AC-15/AC-18 — the payload is confined to the draft that was just read before any of it is
    // written. This is what `locked.lines` is read for: the submitted identifiers are otherwise
    // caller-controlled values that reach the UPDATE predicate unchecked, which would let a
    // confirmation record a received quantity onto another Warehouse's frozen line or onto an
    // already Closed draft (spec.md §6.1), and would let one line named twice split AC-18's
    // per-line bound across two entries.
    const submittedLineIds = lines.map((line) => line.purchaseDraftLineId);
    const draftLineIds = new Set(locked.lines.map((line) => line.id));

    assert(
      recordsAtLeastOneLine(submittedLineIds),
      purchaseDraftArrivalNoLinesError(),
    );
    assert(
      namesOnlyLinesOfTheDraft(submittedLineIds, draftLineIds),
      purchaseDraftArrivalUnknownLineError(
        submittedLineIds.filter((id) => !draftLineIds.has(id)),
      ),
    );
    assert(
      namesEachLineOnce(submittedLineIds),
      purchaseDraftArrivalRepeatedLineError(),
    );

    const arrivalConfirmedAt = this.runtime.now();

    // sad.md §8, §11 — the received quantities are written in the draft's own ascending line order
    // rather than in the order the member happened to compose them, so this path takes the row
    // locks in the one fixed order the amendment path (§6.10) also takes.
    const receivedQuantityByLineId = new Map(
      lines.map((line) => [line.purchaseDraftLineId, line.receivedQuantity]),
    );
    const confirmed = await this.arrivalConfirmationRepository.confirmArrival({
      purchaseDraftId,
      warehouseId: currentUser.warehouseId,
      receivedQuantities: locked.lines
        .filter((line) => receivedQuantityByLineId.has(line.id))
        .map((line) => ({
          purchaseDraftLineId: line.id,
          receivedQuantity: receivedQuantityByLineId.get(line.id)!,
        })),
      arrivalConfirmedByUserId: currentUser.userId,
      arrivalConfirmedAt,
    });
    assert(confirmed, purchaseDraftConcurrentChangeError());

    const demandAllocationLines: DemandAllocationLineInput[] = lines.map(
      (line) => ({
        purchaseDraftLineId: line.purchaseDraftLineId,
        receivedQuantity: line.receivedQuantity,
        allocations: line.allocations,
      }),
    );

    await this.demandAllocationService.allocate(
      currentUser.warehouseId,
      currentUser.userId,
      demandAllocationLines,
    );

    return {
      id: purchaseDraftId,
      state: 'closed',
      arrivalConfirmedByUserId: currentUser.userId,
      arrivalConfirmedAt,
    };
  }
}
