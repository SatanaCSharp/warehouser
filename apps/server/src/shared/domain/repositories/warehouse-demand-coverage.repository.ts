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

// openapi.yaml `ArrivalTimingBucket` — required: [kind, weekStart, owedQuantity,
// expectedQuantity], additionalProperties: false. `weekStart` is `null` only on the `overdue`
// bucket.
export interface ArrivalTimingBucketRead {
  readonly kind: 'overdue' | 'week';
  readonly weekStart: string | null;
  readonly owedQuantity: number;
  readonly expectedQuantity: number;
}

// openapi.yaml `ArrivalTimingExclusions.beyondHorizon` — required: [owedQuantity,
// customerOrderCount].
export interface ArrivalTimingBeyondHorizonRead {
  readonly owedQuantity: number;
  readonly customerOrderCount: number;
}

// openapi.yaml `ArrivalTimingExclusions.undatedReadyDrafts` /
// `.datedDraftsStillInDraft` — both required: [draftCount, orderedQuantity].
export interface ArrivalTimingDraftExclusionRead {
  readonly draftCount: number;
  readonly orderedQuantity: number;
}

// openapi.yaml `ArrivalTimingExclusions.draftsSinceClosedOrDiscarded` — required: [draftCount]
// only; no criterion asks for its quantity (`api-sync-report.md` § Finding 3).
export interface ArrivalTimingClosedOrDiscardedExclusionRead {
  readonly draftCount: number;
}

// openapi.yaml `ArrivalTimingExclusions` — required: [beyondHorizon, undatedReadyDrafts,
// datedDraftsStillInDraft, draftsSinceClosedOrDiscarded], additionalProperties: false.
export interface ArrivalTimingExclusionsRead {
  readonly beyondHorizon: ArrivalTimingBeyondHorizonRead;
  readonly undatedReadyDrafts: ArrivalTimingDraftExclusionRead;
  readonly datedDraftsStillInDraft: ArrivalTimingDraftExclusionRead;
  readonly draftsSinceClosedOrDiscarded: ArrivalTimingClosedOrDiscardedExclusionRead;
}

// openapi.yaml `ArrivalTimingPanel` — the repository's own shape carries `buckets` and
// `exclusions` only; `timezone` is composed by the query from the same bound parameter it passed
// in, not read back from the repository (sad.md §6.4).
export interface ArrivalTimingRead {
  readonly buckets: readonly ArrivalTimingBucketRead[];
  readonly exclusions: ArrivalTimingExclusionsRead;
}

interface ArrivalTimingRawRow {
  readonly buckets: ArrivalTimingBucketRead[];
  readonly exclusions: ArrivalTimingExclusionsRead;
}

// data-model.md § "Time, timezone and the week" — `APP_TIMEZONE` reaches every one of these
// expressions as a **bound query parameter** (`:timezone`), never the connection's implicit
// `TimeZone` setting, so one repository instance can be driven with two different zones
// (`warehouse-purchasing-read.repository.ts`'s `AGE_DAYS_EXPRESSION` establishes the same shape
// for the sibling Age Band read).
const TODAY_EXPRESSION = '(now() AT TIME ZONE :timezone)::date';
const WEEK_START_EXPRESSION =
  "date_trunc('week', now() AT TIME ZONE :timezone)::date";

// AC-07 — the shared bucket axis both series are read against: bucket 0 is Overdue (the date has
// already passed), buckets 1-8 are the eight weeks beginning with the week in progress, and a date
// falling beyond the eighth week resolves to `NULL` — placed in no bucket, picked up instead by
// whichever exclusion CTE reads the same predicate (`buildBeyondHorizonCte` for demand; the supply
// side simply has no bucket to land in, per `data-model.md` § "The read model" — no exclusion is
// stated for it because none is required). One expression, reused for `needed_by` and
// `expected_arrival_date` alike so the two series are bucketed on identical terms.
const bucketIndexExpression = (dateColumn: string): string => `CASE
      WHEN ${dateColumn} < ${TODAY_EXPRESSION} THEN 0
      WHEN ((${dateColumn} - ${WEEK_START_EXPRESSION}) / 7) + 1 > 8 THEN NULL
      ELSE ((${dateColumn} - ${WEEK_START_EXPRESSION}) / 7) + 1
    END`;

// AC-07 — demand bucketed by `needed_by` over Unfulfilled Customer Orders, grouped independently
// of the supply series below so neither can ever be netted against the other in SQL (the two are
// only ever combined by the final bucket-axis join, each as its own column).
const buildDemandBucketsCte = (
  manager: EntityManager,
  warehouseId: string,
  timezone: string,
): SelectQueryBuilder<CustomerOrderEntity> =>
  manager
    .createQueryBuilder()
    .select(bucketIndexExpression('demand.neededBy'), 'bucket_index')
    .addSelect('SUM(demand.outstandingQuantity)::int', 'owed_quantity')
    .from(CustomerOrderEntity, 'demand')
    .where('demand.warehouseId = :warehouseId', { warehouseId })
    .andWhere("demand.state = 'unfulfilled'")
    .groupBy(bucketIndexExpression('demand.neededBy'))
    .setParameters({ warehouseId, timezone });

// AC-08 — supply bucketed by `expected_arrival_date` over Purchase Drafts standing in
// `ready_for_ordering` **at read time**, Via Warehouse lines only — a Direct to Customer line
// reaches no bucket here (it never arrives at this dock).
const buildSupplyBucketsCte = (
  manager: EntityManager,
  warehouseId: string,
  timezone: string,
): SelectQueryBuilder<PurchaseDraftLineEntity> =>
  manager
    .createQueryBuilder()
    .select(bucketIndexExpression('drafts.expectedArrivalDate'), 'bucket_index')
    .addSelect('SUM(lines.orderedQuantity)::int', 'expected_quantity')
    .from(PurchaseDraftLineEntity, 'lines')
    .innerJoin(
      PurchaseDraftEntity,
      'drafts',
      'drafts.id = lines.purchaseDraftId',
    )
    .where('lines.warehouseId = :warehouseId', { warehouseId })
    .andWhere("drafts.state = 'ready_for_ordering'")
    .andWhere("lines.deliveryMode = 'via_warehouse'")
    .andWhere('drafts.expectedArrivalDate IS NOT NULL')
    .groupBy(bucketIndexExpression('drafts.expectedArrivalDate'))
    .setParameters({ warehouseId, timezone });

// AC-07 — the first of the four exclusion columns: demand owed beyond the eighth week, placed in
// no bucket, with the Customer Order count `openapi.yaml` `ArrivalTimingExclusions.beyondHorizon`
// requires beside the quantity. `COUNT(*)`/`SUM(...)` with no `GROUP BY` always returns exactly one
// row, which is what lets the final select treat this CTE as a guaranteed single row to join
// against (the pattern `readCoverageGap`'s `buildRemainderCte` establishes).
const buildBeyondHorizonCte = (
  manager: EntityManager,
  warehouseId: string,
  timezone: string,
): SelectQueryBuilder<CustomerOrderEntity> =>
  manager
    .createQueryBuilder()
    .select(
      'COALESCE(SUM(demand.outstandingQuantity), 0)::int',
      'owed_quantity',
    )
    .addSelect('COUNT(*)::int', 'customer_order_count')
    .from(CustomerOrderEntity, 'demand')
    .where('demand.warehouseId = :warehouseId', { warehouseId })
    .andWhere("demand.state = 'unfulfilled'")
    .andWhere(`${bucketIndexExpression('demand.neededBy')} IS NULL`)
    .setParameters({ warehouseId, timezone });

// AC-08a — the second exclusion: Ready for Ordering drafts carrying no Expected Arrival Date,
// scoped to their Via Warehouse lines exactly as the supply series itself is, so the draft count
// and ordered quantity explain exactly the gap this exclusion exists to close.
const buildUndatedReadyDraftsCte = (
  manager: EntityManager,
  warehouseId: string,
): SelectQueryBuilder<PurchaseDraftLineEntity> =>
  manager
    .createQueryBuilder()
    .select('COUNT(DISTINCT drafts.id)::int', 'draft_count')
    .addSelect(
      'COALESCE(SUM(lines.orderedQuantity), 0)::int',
      'ordered_quantity',
    )
    .from(PurchaseDraftLineEntity, 'lines')
    .innerJoin(
      PurchaseDraftEntity,
      'drafts',
      'drafts.id = lines.purchaseDraftId',
    )
    .where('lines.warehouseId = :warehouseId', { warehouseId })
    .andWhere("drafts.state = 'ready_for_ordering'")
    .andWhere("lines.deliveryMode = 'via_warehouse'")
    .andWhere('drafts.expectedArrivalDate IS NULL');

// AC-08a — the third exclusion: drafts still in Draft that already carry an Expected Arrival Date
// — a working note rather than the commitment freezing makes of it, so the draft appears in no
// week while still counting toward the Coverage Gap's Inbound Quantity beside it.
const buildDatedDraftsStillInDraftCte = (
  manager: EntityManager,
  warehouseId: string,
): SelectQueryBuilder<PurchaseDraftLineEntity> =>
  manager
    .createQueryBuilder()
    .select('COUNT(DISTINCT drafts.id)::int', 'draft_count')
    .addSelect(
      'COALESCE(SUM(lines.orderedQuantity), 0)::int',
      'ordered_quantity',
    )
    .from(PurchaseDraftLineEntity, 'lines')
    .innerJoin(
      PurchaseDraftEntity,
      'drafts',
      'drafts.id = lines.purchaseDraftId',
    )
    .where('lines.warehouseId = :warehouseId', { warehouseId })
    .andWhere("drafts.state = 'draft'")
    .andWhere("lines.deliveryMode = 'via_warehouse'")
    .andWhere('drafts.expectedArrivalDate IS NOT NULL');

// AC-07 — the fourth exclusion: drafts carrying an Expected Arrival Date that have since reached
// Closed or been Discarded. Count only — `openapi.yaml` requires no quantity for this one — so the
// draft itself, not its lines, is what this CTE counts.
const buildDraftsSinceClosedOrDiscardedCte = (
  manager: EntityManager,
  warehouseId: string,
): SelectQueryBuilder<PurchaseDraftEntity> =>
  manager
    .createQueryBuilder()
    .select('COUNT(*)::int', 'draft_count')
    .from(PurchaseDraftEntity, 'drafts')
    .where('drafts.warehouseId = :warehouseId', { warehouseId })
    .andWhere("drafts.state IN ('closed', 'discarded')")
    .andWhere('drafts.expectedArrivalDate IS NOT NULL');

// AC-07 — exactly nine buckets, always: `openapi.yaml` `ArrivalTimingPanel.buckets` is
// `minItems: 9, maxItems: 9`. This one-row-per-index derived table is what guarantees a bucket
// with nothing in it is present and reports `0` rather than being absent, the same cross-join
// pattern `warehouse-purchasing-read.repository.ts`'s Age Band table establishes.
const BUCKET_AXIS_TABLE = '(SELECT generate_series(0, 8) AS bucket_index)';

const bucketsJsonExpression = `(
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'kind', CASE WHEN axis.bucket_index = 0 THEN 'overdue' ELSE 'week' END,
        'weekStart', CASE
          WHEN axis.bucket_index = 0 THEN NULL
          ELSE (${WEEK_START_EXPRESSION} + (axis.bucket_index - 1) * 7)::text
        END,
        'owedQuantity', COALESCE(demand_buckets.owed_quantity, 0),
        'expectedQuantity', COALESCE(supply_buckets.expected_quantity, 0)
      )
      ORDER BY axis.bucket_index
    ),
    '[]'::json
  )
  FROM ${BUCKET_AXIS_TABLE} axis
  LEFT JOIN demand_buckets ON demand_buckets.bucket_index = axis.bucket_index
  LEFT JOIN supply_buckets ON supply_buckets.bucket_index = axis.bucket_index
)`;

const exclusionsJsonExpression = `json_build_object(
  'beyondHorizon', json_build_object(
    'owedQuantity', beyond_horizon.owed_quantity,
    'customerOrderCount', beyond_horizon.customer_order_count
  ),
  'undatedReadyDrafts', json_build_object(
    'draftCount', undated_ready_drafts.draft_count,
    'orderedQuantity', undated_ready_drafts.ordered_quantity
  ),
  'datedDraftsStillInDraft', json_build_object(
    'draftCount', dated_drafts_still_in_draft.draft_count,
    'orderedQuantity', dated_drafts_still_in_draft.ordered_quantity
  ),
  'draftsSinceClosedOrDiscarded', json_build_object(
    'draftCount', drafts_since_closed_or_discarded.draft_count
  )
)`;

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

  // sad.md §6.4 — one statement: the shared bucket axis cross-joined against the demand and supply
  // series (each aggregated in its own CTE, so neither is ever netted against the other), plus the
  // four exclusion CTEs, each guaranteed to return exactly one row, joined in as columns of the
  // same result (AC-07, AC-08, AC-08a). `timezone` is a method parameter — never instance state,
  // never the connection's implicit `TimeZone` — bound as `:timezone` into every expression that
  // needs it (data-model.md § "Time, timezone and the week").
  async readArrivalTiming(
    warehouseId: string,
    timezone: string,
  ): Promise<ArrivalTimingRead> {
    const manager = getEntityManager(this.dataSource);

    const raw = await manager
      .createQueryBuilder()
      .select(bucketsJsonExpression, 'buckets')
      .addSelect(exclusionsJsonExpression, 'exclusions')
      .from('beyond_horizon', 'beyond_horizon')
      .innerJoin('undated_ready_drafts', 'undated_ready_drafts', '1 = 1')
      .innerJoin(
        'dated_drafts_still_in_draft',
        'dated_drafts_still_in_draft',
        '1 = 1',
      )
      .innerJoin(
        'drafts_since_closed_or_discarded',
        'drafts_since_closed_or_discarded',
        '1 = 1',
      )
      .addCommonTableExpression(
        buildDemandBucketsCte(manager, warehouseId, timezone),
        'demand_buckets',
      )
      .addCommonTableExpression(
        buildSupplyBucketsCte(manager, warehouseId, timezone),
        'supply_buckets',
      )
      .addCommonTableExpression(
        buildBeyondHorizonCte(manager, warehouseId, timezone),
        'beyond_horizon',
      )
      .addCommonTableExpression(
        buildUndatedReadyDraftsCte(manager, warehouseId),
        'undated_ready_drafts',
      )
      .addCommonTableExpression(
        buildDatedDraftsStillInDraftCte(manager, warehouseId),
        'dated_drafts_still_in_draft',
      )
      .addCommonTableExpression(
        buildDraftsSinceClosedOrDiscardedCte(manager, warehouseId),
        'drafts_since_closed_or_discarded',
      )
      .setParameters({ warehouseId, timezone })
      .getRawOne<ArrivalTimingRawRow>();

    return {
      buckets: raw?.buckets ?? [],
      exclusions: raw?.exclusions ?? {
        beyondHorizon: { owedQuantity: 0, customerOrderCount: 0 },
        undatedReadyDrafts: { draftCount: 0, orderedQuantity: 0 },
        datedDraftsStillInDraft: { draftCount: 0, orderedQuantity: 0 },
        draftsSinceClosedOrDiscarded: { draftCount: 0 },
      },
    };
  }
}
