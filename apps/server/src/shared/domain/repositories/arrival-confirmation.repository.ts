import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { DataSource } from 'typeorm';

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
