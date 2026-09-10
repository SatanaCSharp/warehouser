import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service.js';
import {
  type PurchaseDraftLineRejectionDisposition,
  PurchaseDraftLineRejectionEntity,
} from 'shared/domain/entities/purchase-draft-line-rejection.entity.js';
import { DataSource } from 'typeorm';

// What §6.4 decides the amendment under, and nothing more: the line and Warehouse the Rejection
// belongs to (AC-26), the Disposition the correction is judged against (AC-18a) and the prose it may
// replace (AC-18b). The quantity, Reason and Source stay out of reach because no rule of this
// operation reads them and none of them is writable after insert (`sad.md` §7).
export interface LockedPurchaseDraftLineRejection {
  readonly id: string;
  readonly purchaseDraftLineId: string;
  readonly warehouseId: string;
  readonly disposition: PurchaseDraftLineRejectionDisposition;
  readonly description: string | null;
}

export interface AmendRejectionInput {
  readonly rejectionId: string;
  readonly warehouseId: string;
  // Absent leaves the column exactly as it was, which is what makes AC-18b's description-only
  // amendment and AC-18's disposition-only amendment one operation rather than two.
  readonly description?: string | null;
  readonly disposition?: PurchaseDraftLineRejectionDisposition;
  readonly amendedByUserId: string;
  readonly amendedAt: Date;
}

// The row count the conditional update reported. AC-18a's refusal **is** the zero, so the count is
// what crosses the boundary rather than a flag derived from a pre-read (`sad.md` §8: state
// transitions are conditional updates, not read-then-write).
export interface AmendRejectionResult {
  readonly affected: number;
}

// T4/`sad.md` §6.4/`data-model.md` § "Repository boundaries" — the amendment of one recorded
// Rejection: resolved in the acting Warehouse under lock, then amended by one conditional update,
// the two inseparable within the caller's single transaction.
@Injectable()
export class PurchaseDraftRejectionRepository {
  constructor(private readonly dataSource: DataSource) {}

  // `sad.md` §6.4 step 3 — the Rejection is resolved by its identifier **and** the acting Warehouse,
  // so one belonging to another Warehouse resolves to `null` exactly as a missing one does and the
  // caller's single refusal cannot disclose that it exists elsewhere (AC-26, `spec.md` §6.1).
  //
  // The row is taken `FOR UPDATE`, per `data-model.md` § "Concurrency, locks and transactions": the
  // resolve and the amendment that follows are then held together for the rest of the caller's
  // transaction, so a second amendment cannot slip between them. `amendRejection`'s predicate is
  // still what refuses the return to Undecided; this lock is what stops two corrections racing.
  async lockRejectionForAmendment(
    rejectionId: string,
    warehouseId: string,
  ): Promise<LockedPurchaseDraftLineRejection | null> {
    const rejection = await getEntityManager(this.dataSource)
      .getRepository(PurchaseDraftLineRejectionEntity)
      .createQueryBuilder('rejection')
      .select([
        'rejection.id',
        'rejection.purchaseDraftLineId',
        'rejection.warehouseId',
        'rejection.disposition',
        'rejection.description',
      ])
      .where('rejection.id = :rejectionId', { rejectionId })
      .andWhere('rejection.warehouseId = :warehouseId', { warehouseId })
      .setLock('pessimistic_write')
      .getOne();

    if (rejection === null) {
      return null;
    }

    return {
      id: rejection.id,
      purchaseDraftLineId: rejection.purchaseDraftLineId,
      warehouseId: rejection.warehouseId,
      disposition: rejection.disposition,
      description: rejection.description,
    };
  }

  // AC-18/AC-18a/AC-18b/`sad.md` §6.4 step 5 — the description, the Disposition and the amending
  // member with the time, applied as **one** conditional update. Nothing is read and compared here
  // first: the predicate carries the acting Warehouse (AC-26 on the write path) and the exclusion of
  // a return to Undecided, so `affected === 0` is the typed refusal rather than a silent no-op.
  //
  // A column the input does not state is left out of the `SET` entirely, so a description-only
  // amendment cannot write a Disposition back through that same predicate and refuse itself. The
  // amending member and the time always travel together, as
  // `chk_purchase_draft_line_rejections_amendment_attribution` admits them only as a set.
  async amendRejection(
    input: AmendRejectionInput,
  ): Promise<AmendRejectionResult> {
    let update = getEntityManager(this.dataSource)
      .createQueryBuilder()
      .update(PurchaseDraftLineRejectionEntity)
      .set({
        ...(input.description !== undefined && {
          description: input.description,
        }),
        ...(input.disposition !== undefined && {
          disposition: input.disposition,
        }),
        amendedByUserId: input.amendedByUserId,
        amendedAt: input.amendedAt,
        updatedAt: input.amendedAt,
      })
      .where('id = :rejectionId', { rejectionId: input.rejectionId })
      .andWhere('warehouse_id = :warehouseId', {
        warehouseId: input.warehouseId,
      });

    if (input.disposition !== undefined) {
      // AC-18a — "a Disposition once decided may be corrected to another decision, but never
      // returned to undecided". The exclusion is exactly that and nothing wider: a correction
      // between two decisions matches, and only an amendment aiming `undecided` at an already
      // decided row is excluded.
      update = update.andWhere(
        `NOT (:disposition = 'undecided' AND disposition <> 'undecided')`,
        { disposition: input.disposition },
      );
    }

    const amendment = await update.execute();

    return { affected: amendment.affected ?? 0 };
  }
}
