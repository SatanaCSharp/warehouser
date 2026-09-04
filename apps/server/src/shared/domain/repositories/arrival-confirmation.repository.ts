import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import {
  type PurchaseDraftLineDeliveryMode,
  type PurchaseDraftLineEndingKind,
  PurchaseDraftLineEntity,
} from 'shared/domain/entities/purchase-draft-line.entity';
import { DataSource, IsNull } from 'typeorm';

export interface LockedPurchaseDraftForArrival {
  readonly id: string;
  readonly warehouseId: string;
  readonly state: string;
}

// AC-15/spec.md §6.1 "Allocation as a back door" — the identifier and nothing else. Arrival
// Confirmation reads the lines because the fixed lock order names them (sad.md §8) and because the
// caller needs to know which lines the confirmation may write at all, not to read anything else off
// them: `ordered_quantity`, `packaging_type_id` and `value_adding_note` are frozen
// fields and AC-17 makes `received_quantity` unbounded above and below by the ordered figure, so no
// bound of this operation is derived from one. Keeping them out of the projection is what makes the
// back-door requirement a property of the write path rather than a check on it (ADR 0002
// "Consequences"), and `arrival-confirmation-write-boundary.spec.ts` asserts it.
export interface LockedPurchaseDraftLineForArrival {
  readonly id: string;
}

export interface LockPurchaseDraftForArrivalResult {
  readonly draft: LockedPurchaseDraftForArrival | null;
  readonly lines: readonly LockedPurchaseDraftLineForArrival[];
}

export interface ReceivedQuantityInput {
  readonly purchaseDraftLineId: string;
  readonly receivedQuantity: number;
}

export interface ConfirmArrivalInput {
  readonly purchaseDraftId: string;
  readonly warehouseId: string;
  readonly receivedQuantities: readonly ReceivedQuantityInput[];
  readonly arrivalConfirmedByUserId: string;
  readonly arrivalConfirmedAt: Date;
}

// T17/ADR 0002 — the per-line ending reads **one** line rather than the whole set, because its
// rules are all decidable from that line alone: the mode it travelled (AC-20) and the ending it may
// already carry (AC-20a). Both are projected here rather than re-read by the caller, and the
// attribution columns come across together because `chk_purchase_draft_lines_ending_attribution`
// admits them only as a set — a refusal that names "when and by whom" has no other source.
//
// This projection deliberately still withholds `ordered_quantity`, `packaging_type_id` and
// `value_adding_note`, for the reason `LockedPurchaseDraftLineForArrival` gives above: AC-19 bounds
// the ending quantity neither above nor below the ordered figure, so no bound of this operation is
// derived from a frozen field, and keeping them out of reach is what makes spec.md §6.1's
// "Allocation as a back door" a property of the write path rather than a check on it.
export interface LockedPurchaseDraftLineForEnding {
  readonly id: string;
  readonly deliveryMode: PurchaseDraftLineDeliveryMode;
  readonly endingKind: PurchaseDraftLineEndingKind | null;
  readonly endingRecordedByUserId: string | null;
  readonly endingRecordedAt: Date | null;
}

export interface LockPurchaseDraftLineForEndingResult {
  readonly draft: LockedPurchaseDraftForArrival | null;
  readonly line: LockedPurchaseDraftLineForEnding | null;
}

export interface RecordLineEndingInput {
  readonly purchaseDraftId: string;
  readonly purchaseDraftLineId: string;
  readonly warehouseId: string;
  readonly endingQuantity: number;
  readonly endingKind: PurchaseDraftLineEndingKind;
  readonly endingRecordedByUserId: string;
  readonly endingRecordedAt: Date;
}

// Whether the ending was written at all, and whether it was the one that closed the draft. The two
// are separate answers because a lost race writes nothing (`recorded: false`) while an ending that
// simply was not the last one writes everything and closes nothing (`closed: false`).
export interface RecordLineEndingResult {
  readonly recorded: boolean;
  readonly closed: boolean;
}

// T15/data-model.md "Repository boundaries" — the Purchase Draft half of Arrival Confirmation
// (ADR 0002, sad.md §6.9/§8). `lockDraftForArrival` reads the draft header and its lines scoped to
// the acting Warehouse, in the ascending line order the fixed lock order names ("the draft row,
// then its lines, then the Customer Orders it touches in ascending identifier order", data-model.md
// "Concurrency, locks and transactions").
//
// Despite the name it takes **no explicit row lock**, reading exactly as
// `PurchaseDraftFreezeRepository.findDraftHeader` does. Isolation comes from `confirmArrival`'s own
// conditional `UPDATE … WHERE state = 'ready_for_ordering'`, which is what the caller's
// pre-read/guarded-write split (server-error-handling.md §3) and the genuine concurrency proof both
// depend on. The read serves two other purposes: it resolves the draft within the acting Warehouse,
// and it is the authority for which lines the confirmation may write at all (AC-15).
@Injectable()
export class ArrivalConfirmationRepository {
  constructor(private readonly dataSource: DataSource) {}

  async lockDraftForArrival(
    purchaseDraftId: string,
    warehouseId: string,
  ): Promise<LockPurchaseDraftForArrivalResult> {
    const manager = getEntityManager(this.dataSource);

    const draft = await manager.getRepository(PurchaseDraftEntity).findOne({
      where: { id: purchaseDraftId, warehouseId },
      select: ['id', 'warehouseId', 'state'],
    });

    if (draft === null) {
      return { draft: null, lines: [] };
    }

    const lines = await manager.getRepository(PurchaseDraftLineEntity).find({
      where: { purchaseDraftId },
      select: ['id'],
      order: { id: 'ASC' },
    });

    return {
      draft: {
        id: draft.id,
        warehouseId: draft.warehouseId,
        state: draft.state,
      },
      lines: lines.map((line) => ({ id: line.id })),
    };
  }

  // T17/sad.md §6.10 step 2 — the draft in the acting Warehouse, then the one named line within it.
  // The line is resolved through the composite tuple rather than by identifier alone, so a line of
  // another draft or another Warehouse resolves to `null` exactly as a missing one does and the
  // caller's single refusal cannot disclose that it exists elsewhere (spec.md §6.1).
  //
  // Like `lockDraftForArrival` this takes no explicit row lock, for the same reason: isolation comes
  // from `recordLineEnding`'s conditional writes, which is what lets a lost race be told apart from
  // an illegal pre-read (server-error-handling.md §3).
  async lockDraftLineForEnding(
    purchaseDraftId: string,
    purchaseDraftLineId: string,
    warehouseId: string,
  ): Promise<LockPurchaseDraftLineForEndingResult> {
    const manager = getEntityManager(this.dataSource);

    const draft = await manager.getRepository(PurchaseDraftEntity).findOne({
      where: { id: purchaseDraftId, warehouseId },
      select: ['id', 'warehouseId', 'state'],
    });

    if (draft === null) {
      return { draft: null, line: null };
    }

    const line = await manager.getRepository(PurchaseDraftLineEntity).findOne({
      where: { id: purchaseDraftLineId, purchaseDraftId, warehouseId },
      select: [
        'id',
        'deliveryMode',
        'endingKind',
        'endingRecordedByUserId',
        'endingRecordedAt',
      ],
    });

    return {
      draft: {
        id: draft.id,
        warehouseId: draft.warehouseId,
        state: draft.state,
      },
      line:
        line === null
          ? null
          : {
              id: line.id,
              deliveryMode: line.deliveryMode,
              endingKind: line.endingKind,
              endingRecordedByUserId: line.endingRecordedByUserId,
              endingRecordedAt: line.endingRecordedAt,
            },
    };
  }

  // AC-19/AC-20a/sad.md §6.10 steps 4–5 — the line's ending, then the draft's closure, both as
  // guarded writes inside the caller's one transaction.
  //
  // The ending is predicated on `ending_recorded_at IS NULL`, which is what makes "a line admits one
  // ending" a property of the write rather than of the caller's pre-read: two concurrent first
  // endings both pass the pre-read, and exactly one affects a row. The caller's own AC-20a refusal
  // still runs first, because only the pre-read can name **when and by whom** the existing ending
  // was recorded; this predicate is the second, independent bound.
  //
  // The closure is the conditional update sad.md §6.10 step 5 requires: it moves the draft to Closed
  // only when no line of it is left without an ending, evaluated in the same statement rather than
  // read and then written, so two concurrent last endings cannot both close it. `affected === 0`
  // here is the ordinary "this was not the last line" answer, not a failure.
  async recordLineEnding(
    input: RecordLineEndingInput,
  ): Promise<RecordLineEndingResult> {
    const manager = getEntityManager(this.dataSource);

    const ending = await manager.getRepository(PurchaseDraftLineEntity).update(
      {
        id: input.purchaseDraftLineId,
        purchaseDraftId: input.purchaseDraftId,
        warehouseId: input.warehouseId,
        endingRecordedAt: IsNull(),
      },
      {
        endingQuantity: input.endingQuantity,
        endingKind: input.endingKind,
        endingRecordedByUserId: input.endingRecordedByUserId,
        endingRecordedAt: input.endingRecordedAt,
        updatedAt: input.endingRecordedAt,
      },
    );

    if (ending.affected !== 1) {
      return { recorded: false, closed: false };
    }

    // `chk_purchase_drafts_closure_attribution` requires `closed_by_user_id`/`closed_at` on every
    // Closed draft whatever path closed it, and `chk_purchase_drafts_closure_path` is what tells an
    // ending-driven closure (no `closure_reason`) from a member's closure with one (AC-21a).
    const closure = await manager
      .createQueryBuilder()
      .update(PurchaseDraftEntity)
      .set({
        state: 'closed',
        closedByUserId: input.endingRecordedByUserId,
        closedAt: input.endingRecordedAt,
        updatedAt: input.endingRecordedAt,
      })
      .where('id = :purchaseDraftId', {
        purchaseDraftId: input.purchaseDraftId,
      })
      .andWhere('warehouse_id = :warehouseId', {
        warehouseId: input.warehouseId,
      })
      .andWhere("state = 'ready_for_ordering'")
      .andWhere(
        `NOT EXISTS (
           SELECT 1 FROM purchase_draft_lines line
           WHERE line.purchase_draft_id = :purchaseDraftId
             AND line.ending_recorded_at IS NULL
         )`,
      )
      .execute();

    return { recorded: true, closed: closure.affected === 1 };
  }

  // AC-17/AC-17b/sad.md §8 — the guarded transition to Closed and every line's received quantity,
  // written in that order so a draft that no longer resolves in Ready for Ordering affects zero
  // rows and writes no received quantity at all. A second confirmation of one draft, or two
  // genuinely concurrent ones, resolve on the same guarded-write terms
  // `PurchaseDraftFreezeRepository.freeze`/`.close` already establish (T13).
  async confirmArrival(input: ConfirmArrivalInput): Promise<boolean> {
    const manager = getEntityManager(this.dataSource);

    const guarded = await manager.getRepository(PurchaseDraftEntity).update(
      {
        id: input.purchaseDraftId,
        warehouseId: input.warehouseId,
        state: 'ready_for_ordering',
      },
      {
        state: 'closed',
        arrivalConfirmedByUserId: input.arrivalConfirmedByUserId,
        arrivalConfirmedAt: input.arrivalConfirmedAt,
        // `chk_purchase_drafts_closure_attribution` requires `closed_by_user_id`/`closed_at` on
        // every Closed draft regardless of the path that closed it; `chk_purchase_drafts_closure_path`
        // is what distinguishes Arrival Confirmation (no `closure_reason`) from a member's closure
        // with a reason (AC-17/AC-21/AC-21a).
        closedByUserId: input.arrivalConfirmedByUserId,
        closedAt: input.arrivalConfirmedAt,
        updatedAt: input.arrivalConfirmedAt,
      },
    );

    if (guarded.affected !== 1) {
      return false;
    }

    // AC-15/spec.md §6.1 — every received quantity is written through the composite tuple the
    // schema already indexes (`uq_purchase_draft_lines_id_draft_warehouse` on
    // `(id, purchase_draft_id, warehouse_id)`), never by identifier alone. The caller checks the
    // same membership against the lines it read; this predicate is the second, independent bound,
    // so a line of another draft or another Warehouse affects zero rows here even if it ever
    // reached this statement.
    for (const line of input.receivedQuantities) {
      await manager.getRepository(PurchaseDraftLineEntity).update(
        {
          id: line.purchaseDraftLineId,
          purchaseDraftId: input.purchaseDraftId,
          warehouseId: input.warehouseId,
        },
        {
          receivedQuantity: line.receivedQuantity,
          updatedAt: input.arrivalConfirmedAt,
        },
      );
    }

    return true;
  }
}
