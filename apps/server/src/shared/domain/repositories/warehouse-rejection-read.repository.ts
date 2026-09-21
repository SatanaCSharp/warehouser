import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { PurchaseDraftLineRejectionEntity } from 'shared/domain/entities/purchase-draft-line-rejection.entity';
import { RejectionReasonEntity } from 'shared/domain/entities/rejection-reason.entity';
import { DataSource } from 'typeorm';

// openapi.yaml `ReasonConcentrationRow` — one row per Rejection Reason, ordered by refused
// quantity descending with the running share as a window function over that order (AC-12).
// `label` is read live from the `rejection_reasons` catalogue — data-model.md § "The read model"
// now records this join (`purchase_draft_line_rejections` ⧸ `rejection_reasons`, joined on
// `rejection_reason_id`) rather than copying the wording onto the Rejection, exactly as
// `arrival-inspection` reads it; the catalogue is extend-only with an `ON DELETE RESTRICT` FK, so
// the join can never drop a row that has Rejections.
export interface WarehouseReasonConcentrationRowRead {
  readonly rejectionReasonId: string;
  readonly label: string;
  readonly refusedQuantity: number;
  readonly sharePercent: number;
  readonly cumulativeSharePercent: number;
  readonly undecidedQuantity: number;
  readonly customerReportedQuantity: number;
}

// openapi.yaml `ReasonConcentrationRemainder` — every Reason beyond the tenth, added up. `null`
// while nothing has been gathered into it — AC-12 requires no Remainder Row be presented at all in
// that case.
export interface WarehouseReasonConcentrationRemainderRead {
  readonly reasonCount: number;
  readonly refusedQuantity: number;
  readonly undecidedQuantity: number;
  readonly customerReportedQuantity: number;
}

// openapi.yaml `ReasonConcentrationPanel`.
export interface WarehouseReasonConcentrationRead {
  readonly totalRefusedQuantity: number;
  readonly rows: readonly WarehouseReasonConcentrationRowRead[];
  readonly remainder: WarehouseReasonConcentrationRemainderRead | null;
}

/** Empty-result shape, guaranteed correct even though the query itself always yields one row. */
const EMPTY_READ: WarehouseReasonConcentrationRead = {
  totalRefusedQuantity: 0,
  rows: [],
  remainder: null,
};

// AC-12 — refused quantity summed by Rejection Reason under the Warehouse predicate, **both**
// Rejection Sources counted (a Warehouse's Rejections are its own wherever the goods were refused
// — the Direct to Customer exclusion that governs the dock figures does not govern this Panel,
// `CONTEXT.md` § Invariants), the Undecided and Customer-reported quantities reported as two
// independent columns so a Rejection that is both is never double-counted, and Reasons beyond the
// tenth rolled into one Remainder Row.
@Injectable()
export class WarehouseRejectionReadRepository {
  constructor(private readonly dataSource: DataSource) {}

  readReasonConcentration(
    warehouseId: string,
  ): Promise<WarehouseReasonConcentrationRead> {
    const manager = getEntityManager(this.dataSource);

    // The statement's own access path — `warehouse_id` filtered, `rejection_reason_id` grouped —
    // is exactly `idx_purchase_draft_line_rejections_warehouse_reason` (data-model.md § Indexes).
    const groupedRejections = manager
      .createQueryBuilder()
      .select('rejection.rejectionReasonId', 'rejection_reason_id')
      .addSelect('SUM(rejection.quantity)::int', 'refused_quantity')
      .addSelect(
        "SUM(CASE WHEN rejection.disposition = 'undecided' THEN rejection.quantity ELSE 0 END)::int",
        'undecided_quantity',
      )
      .addSelect(
        "SUM(CASE WHEN rejection.source = 'customer_reported' THEN rejection.quantity ELSE 0 END)::int",
        'customer_reported_quantity',
      )
      .from(PurchaseDraftLineRejectionEntity, 'rejection')
      .where('rejection.warehouseId = :warehouseId')
      .groupBy('rejection.rejectionReasonId');

    // The running share as a window function over the descending order — `row_num` is what
    // separates the top ten named rows from the Remainder Row, and the tie-break on
    // `rejection_reason_id` keeps the ordering, and so the row/remainder split, deterministic.
    const rankedReasons = manager
      .createQueryBuilder()
      .select('grouped.rejection_reason_id', 'rejection_reason_id')
      .addSelect('reason.label', 'label')
      .addSelect('grouped.refused_quantity', 'refused_quantity')
      .addSelect('grouped.undecided_quantity', 'undecided_quantity')
      .addSelect(
        'grouped.customer_reported_quantity',
        'customer_reported_quantity',
      )
      .addSelect(
        'ROW_NUMBER() OVER (ORDER BY grouped.refused_quantity DESC, grouped.rejection_reason_id ASC)',
        'row_num',
      )
      .addSelect('SUM(grouped.refused_quantity) OVER ()', 'total_quantity')
      .addSelect(
        'SUM(grouped.refused_quantity) OVER (ORDER BY grouped.refused_quantity DESC, grouped.rejection_reason_id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)',
        'cumulative_quantity',
      )
      .from('grouped', 'grouped')
      .innerJoin(
        RejectionReasonEntity,
        'reason',
        'reason.id = grouped.rejection_reason_id',
      );

    return manager
      .createQueryBuilder()
      .select(
        'COALESCE((SELECT SUM(grouped.refused_quantity) FROM grouped), 0)::int',
        'totalRefusedQuantity',
      )
      .addSelect(
        `COALESCE((SELECT json_agg(json_build_object(
            'rejectionReasonId', ranked.rejection_reason_id,
            'label', ranked.label,
            'refusedQuantity', ranked.refused_quantity,
            'sharePercent', ROUND(100.0 * ranked.refused_quantity / NULLIF(ranked.total_quantity, 0), 1),
            'cumulativeSharePercent', ROUND(100.0 * ranked.cumulative_quantity / NULLIF(ranked.total_quantity, 0), 1),
            'undecidedQuantity', ranked.undecided_quantity,
            'customerReportedQuantity', ranked.customer_reported_quantity
          ) ORDER BY ranked.row_num)
          FROM ranked WHERE ranked.row_num <= 10), '[]'::json)`,
        'rows',
      )
      .addSelect(
        `(SELECT CASE WHEN COUNT(*) = 0 THEN NULL ELSE json_build_object(
            'reasonCount', COUNT(*),
            'refusedQuantity', SUM(ranked.refused_quantity),
            'undecidedQuantity', SUM(ranked.undecided_quantity),
            'customerReportedQuantity', SUM(ranked.customer_reported_quantity)
          ) END
          FROM ranked WHERE ranked.row_num > 10)`,
        'remainder',
      )
      .from('(SELECT 1)', 'singleton')
      .addCommonTableExpression(groupedRejections, 'grouped')
      .addCommonTableExpression(rankedReasons, 'ranked')
      .setParameter('warehouseId', warehouseId)
      .getRawOne<WarehouseReasonConcentrationRead>()
      .then((read) => read ?? EMPTY_READ);
  }
}
