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

// T15/T17/data-model.md "Repository boundaries" — the Purchase Draft half of Arrival Confirmation
// (ADR 0002, sad.md §6.9/§8/§6.10).
@Injectable()
export class ArrivalConfirmationRepository {
  constructor(private readonly dataSource: DataSource) {}

  // T17/T18/sad.md §6.10 step 2 — the draft in the acting Warehouse, then the one named line within
  // it. The line is resolved through the composite tuple rather than by identifier alone, so a line
  // of another draft or another Warehouse resolves to `null` exactly as a missing one does and the
  // caller's single refusal cannot disclose that it exists elsewhere (spec.md §6.1).
  //
  // The draft row is taken `FOR UPDATE` first, per data-model.md § "Concurrency, locks and
  // transactions" ("the Purchase Draft row, then its lines … in ascending identifier order").
  // `recordLineEnding`'s conditional writes are still what tells a lost race apart from an illegal
  // pre-read (server-error-handling.md §3), but they are not on their own enough to serialise the
  // draft's *closure*: two members ending the last two lines of a draft concurrently update
  // disjoint line rows, so each closure's `NOT EXISTS (… ending_recorded_at IS NULL)` predicate
  // would otherwise evaluate against a snapshot in which the other line is still un-ended, and
  // *both* closures would affect zero rows — every line ends up with an ending and the draft never
  // reaches Closed. Holding this lock for the rest of the caller's transaction is what forces the
  // second ending's closure to wait for the first's commit and see the first line's ending.
  async lockDraftLineForEnding(
    purchaseDraftId: string,
    purchaseDraftLineId: string,
    warehouseId: string,
  ): Promise<LockPurchaseDraftLineForEndingResult> {
    const manager = getEntityManager(this.dataSource);

    const draft = await manager
      .getRepository(PurchaseDraftEntity)
      .createQueryBuilder('draft')
      .select(['draft.id', 'draft.warehouseId', 'draft.state'])
      .where('draft.id = :purchaseDraftId', { purchaseDraftId })
      .andWhere('draft.warehouseId = :warehouseId', { warehouseId })
      .setLock('pessimistic_write')
      .getOne();

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
      // AC-19/sad.md §6.10 step 5 — "no line is left without an ending" carries no length guard of
      // its own: `NOT EXISTS` is vacuously true over zero rows, so a draft holding no lines would
      // close on the strength of nothing. That draft is unreachable here, not defended against —
      // `purchaseDraftEmptyError` (`ready-purchase-draft.command.ts`) refuses to freeze a Purchase
      // Draft with no lines at all (AC-14a), so no Ready for Ordering draft this statement can ever
      // match holds zero lines.
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
}
