import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service.js';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity.js';
import {
  type PurchaseDraftLineDeliveryMode,
  type PurchaseDraftLineEndingKind,
  PurchaseDraftLineEntity,
  type PurchaseDraftLinePreReceiptConformance,
} from 'shared/domain/entities/purchase-draft-line.entity.js';
import {
  PurchaseDraftLineRejectionEntity,
  type PurchaseDraftLineRejectionSource,
} from 'shared/domain/entities/purchase-draft-line-rejection.entity.js';
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
// T5/AC-17/AC-17a/sad.md §6.1 step 3 — `packaging_type_id` and `value_adding_note` were added to
// this projection because the Pre-receipt Conformance is decided against the instruction **frozen on
// the line**: `chk_purchase_draft_lines_pre_receipt_conformance_instruction` makes Not applicable
// legal only where the line was given neither, so the verdict has no other source than this row.
// That is a bounded narrowing of the withholding (sad.md §2), not a reversal of it.
//
// Exactly one column stays withheld: **`ordered_quantity`**. AC-19 bounds the ending quantity
// neither above nor below the ordered figure, so no bound of this operation is derived from it, and
// keeping it out of reach is what makes spec.md §6.1's "Refusal as a route around the Allocation
// bound" a property of the write path rather than a check on it. sad.md §11 treats a third added
// column as a finding; an architecture check asserts this list.
export interface LockedPurchaseDraftLineForEnding {
  readonly id: string;
  readonly deliveryMode: PurchaseDraftLineDeliveryMode;
  readonly packagingTypeId: string | null;
  readonly valueAddingNote: string | null;
  readonly endingKind: PurchaseDraftLineEndingKind | null;
  readonly endingRecordedByUserId: string | null;
  readonly endingRecordedAt: Date | null;
}

export interface LockPurchaseDraftLineForEndingResult {
  readonly draft: LockedPurchaseDraftForArrival | null;
  readonly line: LockedPurchaseDraftLineForEnding | null;
}

// One refused quantity against one Reason of the catalogue (AC-01, AC-03, AC-06, AC-09). It names
// its Reason rather than copying the wording (AC-23a), and it carries no identifier of its own: the
// row is raised by this write, so its identity is this write's to mint.
export interface RecordLineEndingRejectionInput {
  readonly rejectionReasonId: string;
  readonly quantity: number;
  readonly source: PurchaseDraftLineRejectionSource;
  readonly description: string | null;
}

// The condition half of one submission (spec.md §6 "Ending atomicity"). Both parts are stated
// together because they are judged together and stored together: no caller may leave a Rejection
// behind without the verdict it was raised beside, and none may record a verdict whose refusals
// failed.
//
// Nothing here is second-guessed by this repository. A verdict beside a nothing-received ending, or
// Not applicable on a line frozen carrying an instruction, is refused by
// `chk_purchase_draft_lines_conformance_requires_ending` and
// `chk_purchase_draft_lines_pre_receipt_conformance_instruction` — the store is the arbiter
// (AC-04a, AC-17, AC-17a), and a duplicate guard here would only decide it in a second place.
export interface RecordLineEndingConditionInput {
  readonly preReceiptConformance: PurchaseDraftLinePreReceiptConformance | null;
  readonly preReceiptConformanceNote: string | null;
  readonly rejections: readonly RecordLineEndingRejectionInput[];
}

export interface RecordLineEndingInput {
  readonly purchaseDraftId: string;
  readonly purchaseDraftLineId: string;
  readonly warehouseId: string;
  readonly endingQuantity: number;
  readonly endingKind: PurchaseDraftLineEndingKind;
  readonly endingRecordedByUserId: string;
  readonly endingRecordedAt: Date;
  // `null` where the submission judged nothing and refused nothing — a nothing-received ending
  // (AC-04a), or an ending recorded by a caller that carries no condition at all.
  readonly condition: RecordLineEndingConditionInput | null;
}

// A Rejection carries the Delivery Mode of the line it refuses, so
// `fk_purchase_draft_line_rejections_line` proves the line, its Warehouse and its Mode through one
// reference (AC-25, AC-26). The Mode is derived rather than stated: the ending's kind already fixes
// it — `chk_purchase_draft_lines_ending_matches_mode` admits an arrival only on a Via Warehouse line
// and a direct delivery only on a Direct to Customer one — so accepting it as a second input would
// let a caller state a pair the line cannot hold.
const deliveryModeOfEndingKind: Record<
  PurchaseDraftLineEndingKind,
  PurchaseDraftLineDeliveryMode
> = {
  arrival: 'via_warehouse',
  direct_delivery: 'direct_to_customer',
};

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
        'packagingTypeId',
        'valueAddingNote',
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
              packagingTypeId: line.packagingTypeId,
              valueAddingNote: line.valueAddingNote,
              endingKind: line.endingKind,
              endingRecordedByUserId: line.endingRecordedByUserId,
              endingRecordedAt: line.endingRecordedAt,
            },
    };
  }

  // AC-19/AC-20a/sad.md §6.10 steps 4–5 — the line's ending and its Pre-receipt Conformance, then
  // that line's refusals, then the draft's closure, all inside the caller's one transaction. This
  // repository opens none of its own, so spec.md §6's "Ending atomicity" holds by construction: a
  // failure anywhere — a Reason outside the catalogue, a verdict the store refuses — rolls the whole
  // submission back, its refusals included, because nothing here was ever committed separately.
  //
  // The order is `delivery-addresses`' fixed lock order **extended**, not replaced (sad.md §8,
  // data-model.md § "Concurrency, locks and transactions"): the draft row — already held from
  // `lockDraftLineForEnding`, which is why no statement re-takes it here — then its line, then that
  // line's refusals, then the Customer Orders. The draft's closure is the last write of the set for
  // the same reason, since it touches the row the caller locked first.
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
        preReceiptConformance: input.condition?.preReceiptConformance ?? null,
        preReceiptConformanceNote:
          input.condition?.preReceiptConformanceNote ?? null,
        updatedAt: input.endingRecordedAt,
      },
    );

    if (ending.affected !== 1) {
      return { recorded: false, closed: false };
    }

    // AC-04 — the refusals belong to the ending's own `ending_recorded_at IS NULL` predicate rather
    // than to a second one of their own. Reaching them only through the guarded update above is what
    // makes "no further refusal against a recorded ending" unreachable, instead of a rule an insert
    // ordered ahead of the ending could walk around.
    const rejections = input.condition?.rejections ?? [];

    if (rejections.length > 0) {
      await manager.insert(
        PurchaseDraftLineRejectionEntity,
        rejections.map((rejection) => ({
          id: randomUUID(),
          purchaseDraftLineId: input.purchaseDraftLineId,
          warehouseId: input.warehouseId,
          deliveryMode: deliveryModeOfEndingKind[input.endingKind],
          rejectionReasonId: rejection.rejectionReasonId,
          quantity: rejection.quantity,
          source: rejection.source,
          description: rejection.description,
          // AC-19 — every Rejection starts Undecided; what became of the goods is decided later, by
          // §6.4's amendment. `created_at` **is** the time it was raised.
          disposition: 'undecided' as const,
          raisedByUserId: input.endingRecordedByUserId,
          amendedByUserId: null,
          amendedAt: null,
          createdAt: input.endingRecordedAt,
          updatedAt: input.endingRecordedAt,
        })),
      );
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
