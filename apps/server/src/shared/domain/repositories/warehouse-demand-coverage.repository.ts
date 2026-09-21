import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import {
  DataSource,
  EntityManager,
  ObjectLiteral,
  SelectQueryBuilder,
} from 'typeorm';

// openapi.yaml `CoverageGapRow` — required: [itemId, sku, totalOutstandingQuantity,
// onHandQuantity, inboundQuantity, uncoveredQuantity], additionalProperties: false.
export interface CoverageGapRowRead {
  readonly itemId: string;
  readonly sku: string;
  readonly totalOutstandingQuantity: number;
  readonly onHandQuantity: number;
  readonly inboundQuantity: number;
  readonly uncoveredQuantity: number;
}

// openapi.yaml `CoverageGapRemainder` — the four quantities are the per-Item figures summed across
// the Items the row holds, each computed on the same terms as `CoverageGapRow` (AC-03).
export interface CoverageGapRemainderRead {
  readonly itemCount: number;
  readonly totalOutstandingQuantity: number;
  readonly onHandQuantity: number;
  readonly inboundQuantity: number;
  readonly uncoveredQuantity: number;
}

// openapi.yaml `CoverageGapPanel` — `remainder` is `null` only while ten or fewer Items qualify.
export interface CoverageGapRead {
  readonly rows: readonly CoverageGapRowRead[];
  readonly remainder: CoverageGapRemainderRead | null;
}

interface CoverageGapRawRow {
  readonly rows: CoverageGapRowRead[];
  readonly remainder: CoverageGapRemainderRead | null;
}

// AC-04 — `outstanding`: `SUM(outstanding_quantity)` over Unfulfilled Customer Orders, grouped by
// Item. The state predicate alone is what excludes a cancelled order's retained quantity; nothing
// downstream re-checks it. Grouped independently of `inbound` (sad.md §6.3), so this aggregate can
// never be inflated by however many Purchase Draft Lines the same Item also has.
const buildOutstandingCte = (
  manager: EntityManager,
  warehouseId: string,
): SelectQueryBuilder<CustomerOrderEntity> =>
  manager
    .createQueryBuilder()
    .select('demand.itemId', 'item_id')
    .addSelect('SUM(demand.outstandingQuantity)::int', 'outstanding_quantity')
    .from(CustomerOrderEntity, 'demand')
    .where('demand.warehouseId = :warehouseId', { warehouseId })
    .andWhere("demand.state = 'unfulfilled'")
    .groupBy('demand.itemId');

// AC-06/AC-08/AC-11 — `inbound`: `SUM(ordered_quantity)` over the lines of Purchase Drafts still in
// Draft or Ready for Ordering, grouped by Item. Read from the line's own `ordered_quantity`, never
// from a link's stated quantity, and both Delivery Modes count — nothing here filters on
// `delivery_mode`. Grouped independently of `outstanding` for the same reason as above.
const buildInboundCte = (
  manager: EntityManager,
  warehouseId: string,
): SelectQueryBuilder<PurchaseDraftLineEntity> =>
  manager
    .createQueryBuilder()
    .select('line.itemId', 'item_id')
    .addSelect('SUM(line.orderedQuantity)::int', 'inbound_quantity')
    .from(PurchaseDraftLineEntity, 'line')
    .innerJoin(PurchaseDraftEntity, 'draft', 'draft.id = line.purchaseDraftId')
    .where('line.warehouseId = :warehouseId', { warehouseId })
    .andWhere("draft.state IN ('draft', 'ready_for_ordering')")
    .groupBy('line.itemId');

// AC-25 — one row per Item that some Unfulfilled Customer Order still asks for (the `outstanding`
// CTE's own membership), `on_hand_quantity` read directly from the Item with `deactivated_at`
// applied as no filter at all, and `inbound_quantity` joined in from its own CTE (`0` where the
// Item has none open). Kept as its own CTE, one join short of `ranked` below, so the arithmetic
// that turns these three figures into Uncovered Quantity reads only already-materialized
// `snake_case` output columns — never the Item's own `onHandQuantity` property next to a `+`/`-`,
// which is what `items/domain/on-hand-write-boundary.spec.ts` (AC-18a) scans for as the shape of a
// figure being *derived from itself*. This is a read beside two other figures, not that.
const buildJoinedCte = (
  manager: EntityManager,
): SelectQueryBuilder<ObjectLiteral> =>
  manager
    .createQueryBuilder()
    .select('item.id', 'item_id')
    .addSelect('item.sku', 'sku')
    .addSelect('outstanding.outstanding_quantity', 'total_outstanding_quantity')
    .addSelect('item.onHandQuantity', 'on_hand_quantity')
    .addSelect('COALESCE(inbound.inbound_quantity, 0)', 'inbound_quantity')
    .from('outstanding', 'outstanding')
    .innerJoin(ItemEntity, 'item', 'item.id = outstanding.item_id')
    .leftJoin('inbound', 'inbound', 'inbound.item_id = outstanding.item_id');

// AC-05 — Uncovered floored at nothing, never a negative (`GREATEST(...)`), and the row number is
// the one total order AC-03 requires: uncovered descending, then total outstanding descending,
// then SKU ascending.
const buildRankedCte = (
  manager: EntityManager,
): SelectQueryBuilder<ObjectLiteral> => {
  const uncoveredExpression =
    'GREATEST(total_outstanding_quantity - on_hand_quantity - inbound_quantity, 0)';

  return manager
    .createQueryBuilder()
    .select('item_id', 'item_id')
    .addSelect('sku', 'sku')
    .addSelect('total_outstanding_quantity', 'total_outstanding_quantity')
    .addSelect('on_hand_quantity', 'on_hand_quantity')
    .addSelect('inbound_quantity', 'inbound_quantity')
    .addSelect(uncoveredExpression, 'uncovered_quantity')
    .addSelect(
      `ROW_NUMBER() OVER (ORDER BY ${uncoveredExpression} DESC, total_outstanding_quantity DESC, sku ASC)`,
      'row_number',
    )
    .from('joined', 'joined');
};

// AC-03 — every Item below the tenth, added up, stating how many it holds. `COUNT(*)`/`SUM(...)`
// with no `GROUP BY` always returns exactly one row, so an empty remainder reads as `item_count = 0`
// rather than as no row at all — which is what lets the final select turn it into `null` with one
// `CASE`.
const buildRemainderCte = (
  manager: EntityManager,
): SelectQueryBuilder<ObjectLiteral> =>
  manager
    .createQueryBuilder()
    .select('COUNT(*)::int', 'item_count')
    .addSelect(
      'COALESCE(SUM(ranked.total_outstanding_quantity), 0)::int',
      'total_outstanding_quantity',
    )
    .addSelect(
      'COALESCE(SUM(ranked.on_hand_quantity), 0)::int',
      'on_hand_quantity',
    )
    .addSelect(
      'COALESCE(SUM(ranked.inbound_quantity), 0)::int',
      'inbound_quantity',
    )
    .addSelect(
      'COALESCE(SUM(ranked.uncovered_quantity), 0)::int',
      'uncovered_quantity',
    )
    .from('ranked', 'ranked')
    .where('ranked.row_number > 10');

const rowsJsonExpression = `(
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'itemId', ranked.item_id,
        'sku', ranked.sku,
        'totalOutstandingQuantity', ranked.total_outstanding_quantity,
        'onHandQuantity', ranked.on_hand_quantity,
        'inboundQuantity', ranked.inbound_quantity,
        'uncoveredQuantity', ranked.uncovered_quantity
      )
      ORDER BY ranked.row_number
    ),
    '[]'::json
  )
  FROM ranked
  WHERE ranked.row_number <= 10
)`;

const remainderJsonExpression = `CASE
  WHEN remainder.item_count = 0 THEN NULL
  ELSE json_build_object(
    'itemCount', remainder.item_count,
    'totalOutstandingQuantity', remainder.total_outstanding_quantity,
    'onHandQuantity', remainder.on_hand_quantity,
    'inboundQuantity', remainder.inbound_quantity,
    'uncoveredQuantity', remainder.uncovered_quantity
  )
END`;

// `WarehouseDemandCoverageRepository` — Coverage Gap and Arrival Timing share this file
// (data-model.md § Repository boundaries) because both read `customer_orders`, `purchase_drafts`
// and `purchase_draft_lines` under one Warehouse predicate. This is its first method; Arrival
// Timing (T6) adds the second.
@Injectable()
export class WarehouseDemandCoverageRepository {
  constructor(private readonly dataSource: DataSource) {}

  // sad.md §6.3 — one statement, joined on `item_id`: `outstanding` and `inbound` are each grouped
  // independently of the other, so no quantity is ever multiplied by the number of records counted
  // beside it (AC-06a); `joined` brings in the Item's own `on_hand_quantity` (read directly,
  // `deactivated_at` never a filter); `ranked` computes Uncovered Quantity and the one total order
  // AC-03 requires; `remainder` rolls up everything past the tenth. The bucket boundary and the
  // flooring both live in this SQL — nothing downstream buckets or re-floors in memory
  // (data-model.md § Repository boundaries).
  async readCoverageGap(warehouseId: string): Promise<CoverageGapRead> {
    const manager = getEntityManager(this.dataSource);

    const raw = await manager
      .createQueryBuilder()
      .select(rowsJsonExpression, 'rows')
      .addSelect(remainderJsonExpression, 'remainder')
      .from('remainder', 'remainder')
      .addCommonTableExpression(
        buildOutstandingCte(manager, warehouseId),
        'outstanding',
      )
      .addCommonTableExpression(
        buildInboundCte(manager, warehouseId),
        'inbound',
      )
      .addCommonTableExpression(buildJoinedCte(manager), 'joined')
      .addCommonTableExpression(buildRankedCte(manager), 'ranked')
      .addCommonTableExpression(buildRemainderCte(manager), 'remainder')
      .getRawOne<CoverageGapRawRow>();

    return {
      rows: raw?.rows ?? [],
      remainder: raw?.remainder ?? null,
    };
  }
}
