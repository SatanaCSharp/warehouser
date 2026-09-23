import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { ArrivalAllocationEntity } from 'shared/domain/entities/arrival-allocation.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import {
  DataSource,
  EntityManager,
  ObjectLiteral,
  SelectQueryBuilder,
} from 'typeorm';

// openapi.yaml `DemandPressureWarehouse`.
export interface DemandPressureWarehouseRead {
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly overdueQuantity: number;
  readonly dueSoonQuantity: number;
  readonly laterQuantity: number;
  readonly totalOutstandingQuantity: number;
}

// openapi.yaml `DemandPressurePanel`.
export interface DemandPressurePanelRead {
  readonly archivedWarehouseCount: number;
  readonly warehouses: readonly DemandPressureWarehouseRead[];
}

// `purchase_drafts.state` — the four the schema admits (`chk_purchase_drafts_state`, not modelled
// here as its own entity type; see `purchase-draft.entity.ts`'s plain `string` column).
export type PurchaseDraftState =
  'draft' | 'ready_for_ordering' | 'closed' | 'discarded';

// openapi.yaml `PurchasingSpreadCell`.
export interface PurchasingSpreadCellRead {
  readonly state: PurchaseDraftState;
  readonly draftCount: number;
}

// openapi.yaml `PurchasingSpreadWarehouse` — `counts` always carries all four states (AC-18).
export interface PurchasingSpreadWarehouseRead {
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly counts: readonly PurchasingSpreadCellRead[];
}

// openapi.yaml `PurchasingSpreadPanel`.
export interface PurchasingSpreadPanelRead {
  readonly archivedWarehouseCount: number;
  readonly warehouses: readonly PurchasingSpreadWarehouseRead[];
}

// openapi.yaml `OrderFlowWeek`.
export interface OrderFlowWeekRead {
  readonly weekStart: string;
  readonly recordedQuantity: number;
  readonly assignedQuantity: number;
  readonly cancelledQuantity: number;
  readonly stillAwaitedQuantity: number;
}

// openapi.yaml `OrderFlowPanel` — no `warehouseId`/`warehouseName` anywhere: the one Panel that
// pools across the Workspace and names no Warehouse (AC-16). `timezone` is a bound query parameter
// rather than a column, so it is not echoed back here; `ReadOrderFlowQuery` composes it onto the
// response from the same value it passed in, exactly as `ArrivalTimingRead` above leaves it to
// `ReadArrivalTimingQuery`.
export interface OrderFlowPanelRead {
  readonly archivedWarehouseCount: number;
  readonly weeks: readonly OrderFlowWeekRead[];
}

// openapi.yaml `ReceiptReliabilityExclusions` — six independent, non-disjoint counts (its own
// description: "not a partition, and nothing here should be summed").
export interface ReceiptReliabilityExclusionsRead {
  readonly undatedLineCount: number;
  readonly noEndingRecordedLineCount: number;
  readonly nothingReceivedLineCount: number;
  readonly directToCustomerLineCount: number;
  readonly unrecordedConformanceLineCount: number;
  readonly notApplicableConformanceLineCount: number;
}

// openapi.yaml `ReceiptReliabilityWarehouse` — both rates `null`, never `0`, where no line
// qualifies (AC-20a).
export interface ReceiptReliabilityWarehouseRead {
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly onTimeArrivalRatePercent: number | null;
  readonly conformanceRatePercent: number | null;
  readonly receivedQuantity: number;
  readonly exclusions: ReceiptReliabilityExclusionsRead;
}

// openapi.yaml `ReceiptReliabilityPanel`.
export interface ReceiptReliabilityPanelRead {
  readonly archivedWarehouseCount: number;
  readonly warehouses: readonly ReceiptReliabilityWarehouseRead[];
}

interface PanelRow<TWarehouse> {
  readonly archivedWarehouseCount: number;
  readonly warehouses: TWarehouse[] | null;
}

interface OrderFlowRawRow {
  readonly archivedWarehouseCount: number;
  readonly weeks: OrderFlowWeekRead[] | null;
}

// data-model.md "Workspace surface" — the archived half of the shared scope, shared verbatim by
// every Workspace Panel this repository will grow (T9/T10). A module-level function rather than a
// private method: `creating-a-server-repository.md` forbids private methods on a repository class,
// and this needs no collaborator beyond the manager it is handed
// (`arrival-confirmation.repository.ts`'s `statedConformance` is the sibling precedent).
const archivedWarehouseCountSubquery = (
  manager: EntityManager,
  workspaceId: string,
): string =>
  manager
    .createQueryBuilder()
    .select('COUNT(*)::int')
    .from(WarehouseEntity, 'archivedWarehouse')
    .where('archivedWarehouse.workspaceId = :workspaceId', { workspaceId })
    .andWhere('archivedWarehouse.archivedAt IS NOT NULL')
    .getQuery();

// Order Flow pools twelve weeks, oldest first, ending with the week in progress.
const orderFlowWeekCount = 12;
const currentWeekStartExpression =
  "date_trunc('week', (now() AT TIME ZONE :timezone))";
// The Monday twelve weeks ago, converted back to a `timestamptz` so it can bound
// `customer_orders.created_at` directly (`data-model.md` "The read model": "created_at >= twelve
// weeks ago"). Shared by the week-series CTE and the orders CTE so the two windows can never drift
// apart.
const windowLowerBoundExpression = `(${currentWeekStartExpression} - interval '${orderFlowWeekCount - 1} weeks') AT TIME ZONE :timezone`;

// data-model.md "One thing `implement` must get right" — the Workspace scope resolved as an
// explicit array, bound into the window CTE's join as `= ANY(...)` rather than left as a
// correlated `IN (SELECT id FROM warehouses WHERE …)`, which the audit measured forcing a Seq Scan
// on `customer_orders` even at moderate selectivity. `array_agg` over zero active Warehouses
// yields `NULL`, and `= ANY(NULL)` matches nothing, which is the correct empty result rather than a
// special case.
const buildActiveWarehousesCte = (
  manager: EntityManager,
  workspaceId: string,
): SelectQueryBuilder<WarehouseEntity> =>
  manager
    .createQueryBuilder()
    .select('array_agg(activeWarehouse.id)', 'ids')
    .from(WarehouseEntity, 'activeWarehouse')
    .where('activeWarehouse.workspaceId = :workspaceId', { workspaceId })
    .andWhere('activeWarehouse.archivedAt IS NULL');

// `date_trunc('week', …)` is Monday-start ISO-8601 with no configuration needed
// (`data-model.md` "Time, timezone and the week"). Twelve rows, oldest first, so a week with
// nothing recorded in it is still present and reports zero rather than being absent (AC-16).
// `generate_series` is a set-returning function with no table behind it, so this CTE is written as
// raw SQL text (`addCommonTableExpression` accepts either form) rather than through
// `SelectQueryBuilder`, which requires a `.from()` target it has none to give. `:timezone` stays a
// bound parameter — the caller registers it on the outer query, exactly as every scalar subquery
// embedded by `.getQuery()` elsewhere in this file already does.
const buildWeekSeriesCteSql = (): string =>
  `SELECT generate_series(${currentWeekStartExpression} - interval '${orderFlowWeekCount - 1} weeks', ${currentWeekStartExpression}, interval '1 week')::date AS week_start`;

// data-model.md "The read model" — **every** Customer Order state including cancelled, the one
// read that does (AC-04, AC-16), keyed on `created_at`'s own week, never `needed_by`'s
// (AC-17: mutation-proven — keying on `needed_by` instead breaks 8 of the 9 Order Flow cases).
// `quantity` and `outstanding_quantity` are read as they stand now, never as they stood (AC-17a).
const buildOrdersCte = (
  manager: EntityManager,
  timezone: string,
): SelectQueryBuilder<CustomerOrderEntity> =>
  manager
    .createQueryBuilder()
    .select('customerOrder.id', 'id')
    .addSelect('customerOrder.quantity', 'quantity')
    .addSelect('customerOrder.outstandingQuantity', 'outstanding_quantity')
    .addSelect('customerOrder.state', 'state')
    .addSelect(
      "(date_trunc('week', customerOrder.createdAt AT TIME ZONE :timezone))::date",
      'week_start',
    )
    .from(CustomerOrderEntity, 'customerOrder')
    .innerJoin(
      'activewarehouses',
      'activewarehouses',
      'customerOrder.warehouseId = ANY(activewarehouses.ids)',
    )
    .where(`customerOrder.createdAt >= ${windowLowerBoundExpression}`)
    .setParameter('timezone', timezone);

// data-model.md "The read model" — the allocation aggregate stays in its own CTE, grouped by
// `customer_order_id`, and is joined back rather than fanned out through a direct join to
// `arrival_allocations` (AC-06a: mutation-proven — removing this grouping fails exactly the
// aggregation-integrity case, `expected 400 to be 200`, and nothing else). Scoped to the orders
// already windowed above via the inner join, so an Allocation on an out-of-window or archived-
// Warehouse order never reaches this aggregate.
const buildAllocationsCte = (
  manager: EntityManager,
): SelectQueryBuilder<ArrivalAllocationEntity> =>
  manager
    .createQueryBuilder()
    .select('allocation.customerOrderId', 'customer_order_id')
    .addSelect('SUM(allocation.allocatedQuantity)::int', 'allocated_quantity')
    .from(ArrivalAllocationEntity, 'allocation')
    .innerJoin('orders', 'orders', 'orders.id = allocation.customerOrderId')
    .groupBy('allocation.customerOrderId');

// The week's whole (`recordedQuantity`), the assigned part added against the order's own
// recording week regardless of when the Allocation itself was made (AC-17), and the withdrawn
// part read from the cancelled order's retained `outstanding_quantity` rather than its whole
// `quantity` — stating the whole would double-count the part already allocated
// (`data-model.md` "The read model", AC-04). `allocations` already grouped one row per Customer
// Order, so this `LEFT JOIN` cannot fan out `orders.quantity`.
const buildWeekAggregatesCte = (
  manager: EntityManager,
): SelectQueryBuilder<ObjectLiteral> =>
  manager
    .createQueryBuilder()
    .select('orders.week_start', 'week_start')
    .addSelect('SUM(orders.quantity)::int', 'recorded_quantity')
    .addSelect(
      'COALESCE(SUM(allocations.allocated_quantity), 0)::int',
      'assigned_quantity',
    )
    .addSelect(
      "COALESCE(SUM(CASE WHEN orders.state = 'cancelled' THEN orders.outstanding_quantity ELSE 0 END), 0)::int",
      'cancelled_quantity',
    )
    .from('orders', 'orders')
    .leftJoin(
      'allocations',
      'allocations',
      'allocations.customer_order_id = orders.id',
    )
    .groupBy('orders.week_start');

const stillAwaitedExpression =
  'COALESCE(weekaggregates.recorded_quantity, 0) - COALESCE(weekaggregates.assigned_quantity, 0) - COALESCE(weekaggregates.cancelled_quantity, 0)';

// `stillAwaitedQuantity` is carried as its own field so the client subtracts nothing
// (`openapi.yaml` `OrderFlowWeek`).
const orderFlowWeeksJsonExpression = `COALESCE(json_agg(json_build_object('weekStart', weekseries.week_start, 'recordedQuantity', COALESCE(weekaggregates.recorded_quantity, 0), 'assignedQuantity', COALESCE(weekaggregates.assigned_quantity, 0), 'cancelledQuantity', COALESCE(weekaggregates.cancelled_quantity, 0), 'stillAwaitedQuantity', ${stillAwaitedExpression}) ORDER BY weekseries.week_start), '[]'::json)`;

// data-model.md "Workspace surface" § Receipt Reliability — a Purchase Draft Line correlated on
// `line.warehouseId = warehouse.id` exactly as Demand Pressure's and Purchasing Spread's own
// scalar subqueries correlate, joined to its own Purchase Draft for `expected_arrival_date`. A
// module-level function rather than a private method, for the same reason
// `archivedWarehouseCountSubquery` is one (`creating-a-server-repository.md` forbids private
// methods on a repository class). The withdrawn `purchase_draft_lines (warehouse_id,
// purchase_draft_id)` index (`data-model.md` "Indexes deliberately not added") means no join-order
// lever applies here, unlike Order Flow's `= ANY(...)` binding.
const receiptLineAggregate = (
  manager: EntityManager,
  select: string,
  condition: string,
): string =>
  manager
    .createQueryBuilder()
    .select(select)
    .from(PurchaseDraftLineEntity, 'line')
    .innerJoin(PurchaseDraftEntity, 'draft', 'draft.id = line.purchaseDraftId')
    .where('line.warehouseId = warehouse.id')
    .andWhere(condition)
    .getQuery();

// data-model.md "Workspace surface" — every Workspace read resolves this scope first:
// `warehouses WHERE workspace_id = $1 AND archived_at IS NULL`, and reports the archived count as
// a field of its own (`spec.md` §8 default). `WorkspacePerformanceReadRepository` is the shared
// home for the four Workspace Panels this scope bounds (`data-model.md` "Repository boundaries");
// this task adds Demand Pressure (AC-14) and Purchasing Spread (AC-18). T9/T10 extend this class
// with Order Flow and Receipt Reliability rather than opening a second repository.
@Injectable()
export class WorkspacePerformanceReadRepository {
  constructor(private readonly dataSource: DataSource) {}

  // AC-14 — outstanding quantity per active Warehouse, split into the three Urgency Bands, as
  // absolute quantities never shares. Each band and the archived count are their own correlated
  // scalar subquery (data-model.md "The aggregation rule" — every independent aggregation is
  // computed in its own context, never fanned out through a join), so a second Warehouse gaining a
  // Customer Order can never inflate the first Warehouse's own row (`spec.md` §6 "Aggregation
  // integrity"). `timezone` is a bound query parameter, never instance state — the same repository
  // instance answers two different bound zones in the same test (`data-model.md` "Time, timezone
  // and the week": "not the session's TimeZone setting").
  async readDemandPressure(
    workspaceId: string,
    timezone: string,
  ): Promise<DemandPressurePanelRead> {
    const manager = getEntityManager(this.dataSource);

    // `data-model.md § Indexes` — `idx_customer_orders_unfulfilled_demand` is a *partial* index
    // (`WHERE state = 'unfulfilled'`) led by `warehouse_id`, so every one of these four correlates
    // on `demand.warehouseId = warehouse.id` and repeats the partial predicate verbatim.
    const unfulfilledDemandCondition =
      "demand.warehouseId = warehouse.id AND demand.state = 'unfulfilled'";
    const today = '(now() AT TIME ZONE :timezone)::date';

    const overdueQuantity = manager
      .createQueryBuilder()
      .select('COALESCE(SUM(demand.outstandingQuantity), 0)::int')
      .from(CustomerOrderEntity, 'demand')
      .where(unfulfilledDemandCondition)
      .andWhere(`demand.neededBy < ${today}`)
      .getQuery();

    const dueSoonQuantity = manager
      .createQueryBuilder()
      .select('COALESCE(SUM(demand.outstandingQuantity), 0)::int')
      .from(CustomerOrderEntity, 'demand')
      .where(unfulfilledDemandCondition)
      .andWhere(`demand.neededBy >= ${today}`)
      .andWhere(`demand.neededBy <= ${today} + 14`)
      .getQuery();

    const laterQuantity = manager
      .createQueryBuilder()
      .select('COALESCE(SUM(demand.outstandingQuantity), 0)::int')
      .from(CustomerOrderEntity, 'demand')
      .where(unfulfilledDemandCondition)
      .andWhere(`demand.neededBy > ${today} + 14`)
      .getQuery();

    const totalOutstandingQuantity = manager
      .createQueryBuilder()
      .select('COALESCE(SUM(demand.outstandingQuantity), 0)::int')
      .from(CustomerOrderEntity, 'demand')
      .where(unfulfilledDemandCondition)
      .getQuery();

    const warehouses = manager
      .createQueryBuilder()
      .select(
        `COALESCE(json_agg(json_build_object('warehouseId', warehouse.id, 'warehouseName', warehouse.name, 'overdueQuantity', (${overdueQuantity}), 'dueSoonQuantity', (${dueSoonQuantity}), 'laterQuantity', (${laterQuantity}), 'totalOutstandingQuantity', (${totalOutstandingQuantity})) ORDER BY warehouse.name, warehouse.id), '[]'::json)`,
      )
      .from(WarehouseEntity, 'warehouse')
      .where('warehouse.workspaceId = :workspaceId')
      .andWhere('warehouse.archivedAt IS NULL')
      .getQuery();

    const archivedWarehouseCount = archivedWarehouseCountSubquery(
      manager,
      workspaceId,
    );

    const row = await manager
      .getRepository(WorkspaceEntity)
      .createQueryBuilder('workspace')
      .select(`(${archivedWarehouseCount})`, 'archivedWarehouseCount')
      .addSelect(`(${warehouses})`, 'warehouses')
      .where('workspace.id = :workspaceId', { workspaceId })
      .setParameters({ timezone })
      .getRawOne<PanelRow<DemandPressureWarehouseRead>>();

    return {
      archivedWarehouseCount: row?.archivedWarehouseCount ?? 0,
      warehouses: row?.warehouses ?? [],
    };
  }

  // AC-18 — draft counts per active Warehouse across all four Purchase Draft states, the one
  // Workspace read that counts `closed` and `discarded` (`data-model.md` "The read model"). Every
  // pairing is its own correlated `COUNT(*)` scalar subquery, so a state with no draft still
  // reports a `0` cell rather than an absent one, and a second Warehouse's drafts can never change
  // the first Warehouse's own counts.
  async readPurchasingSpread(
    workspaceId: string,
  ): Promise<PurchasingSpreadPanelRead> {
    const manager = getEntityManager(this.dataSource);

    const draftCountByState = (state: PurchaseDraftState): string =>
      manager
        .createQueryBuilder()
        .select('COUNT(*)::int')
        .from(PurchaseDraftEntity, 'draft')
        .where('draft.warehouseId = warehouse.id')
        .andWhere(`draft.state = '${state}'`)
        .getQuery();

    const counts = (
      ['draft', 'ready_for_ordering', 'closed', 'discarded'] as const
    )
      .map(
        (state) =>
          `json_build_object('state', '${state}', 'draftCount', (${draftCountByState(state)}))`,
      )
      .join(', ');

    const warehouses = manager
      .createQueryBuilder()
      .select(
        `COALESCE(json_agg(json_build_object('warehouseId', warehouse.id, 'warehouseName', warehouse.name, 'counts', json_build_array(${counts})) ORDER BY warehouse.name, warehouse.id), '[]'::json)`,
      )
      .from(WarehouseEntity, 'warehouse')
      .where('warehouse.workspaceId = :workspaceId')
      .andWhere('warehouse.archivedAt IS NULL')
      .getQuery();

    const archivedWarehouseCount = archivedWarehouseCountSubquery(
      manager,
      workspaceId,
    );

    const row = await manager
      .getRepository(WorkspaceEntity)
      .createQueryBuilder('workspace')
      .select(`(${archivedWarehouseCount})`, 'archivedWarehouseCount')
      .addSelect(`(${warehouses})`, 'warehouses')
      .where('workspace.id = :workspaceId', { workspaceId })
      .getRawOne<PanelRow<PurchasingSpreadWarehouseRead>>();

    return {
      archivedWarehouseCount: row?.archivedWarehouseCount ?? 0,
      warehouses: row?.warehouses ?? [],
    };
  }

  // AC-16/AC-17/AC-17a/AC-06a/AC-04 — twelve weeks pooled across the Workspace's active
  // Warehouses, naming none of them. `activewarehouses` resolves the scope once as an explicit
  // array bound into the window CTE's join (`data-model.md` "One thing `implement` must get
  // right"); `weekseries` generates the twelve week starts independently of whether any order
  // falls in them; `orders` windows and keys every Customer Order state on its own recording week;
  // `allocations` aggregates per Customer Order in its own CTE before being joined back, so several
  // Allocations against one order can never multiply that order's own `quantity` (AC-06a); the
  // final select reports each week's whole, its assigned and cancelled parts, and leaves
  // `stillAwaitedQuantity` for the client to read rather than subtract.
  async readOrderFlow(
    workspaceId: string,
    timezone: string,
  ): Promise<OrderFlowPanelRead> {
    const manager = getEntityManager(this.dataSource);

    const archivedWarehouseCount = archivedWarehouseCountSubquery(
      manager,
      workspaceId,
    );

    const raw = await manager
      .createQueryBuilder()
      .select(`(${archivedWarehouseCount})`, 'archivedWarehouseCount')
      .addSelect(orderFlowWeeksJsonExpression, 'weeks')
      .from('weekseries', 'weekseries')
      .leftJoin(
        'weekaggregates',
        'weekaggregates',
        'weekaggregates.week_start = weekseries.week_start',
      )
      .addCommonTableExpression(
        buildActiveWarehousesCte(manager, workspaceId),
        'activewarehouses',
      )
      .addCommonTableExpression(buildWeekSeriesCteSql(), 'weekseries')
      .addCommonTableExpression(buildOrdersCte(manager, timezone), 'orders')
      .addCommonTableExpression(buildAllocationsCte(manager), 'allocations')
      .addCommonTableExpression(
        buildWeekAggregatesCte(manager),
        'weekaggregates',
      )
      .setParameters({ workspaceId, timezone })
      .getRawOne<OrderFlowRawRow>();

    return {
      archivedWarehouseCount: raw?.archivedWarehouseCount ?? 0,
      weeks: raw?.weeks ?? [],
    };
  }

  // AC-19/AC-20/AC-20a/AC-20b — the heaviest read on either surface and the only one with no
  // period bound (`data-model.md` "Workspace surface"). The two rates keep genuinely different
  // denominators and different Delivery Mode rules (`data-model.md` "The read model"): the
  // On-time Arrival Rate is Via Warehouse lines only, dated, whose ending recorded something
  // (AC-20b); the Conformance Rate is not restricted by Delivery Mode at all. Each rate is its own
  // `CASE WHEN denominator = 0 THEN NULL …` expression rather than a `?? 0` in application code, so
  // "no admissible line" stays `null` all the way from the database (AC-20a). `:timezone` is a
  // bound query parameter reused inside the on-time verdict's `AT TIME ZONE` expression exactly as
  // Demand Pressure's and Order Flow's own bound zone is (`data-model.md` "Time, timezone and the
  // week": "not the session's TimeZone setting").
  async readReceiptReliability(
    workspaceId: string,
    timezone: string,
  ): Promise<ReceiptReliabilityPanelRead> {
    const manager = getEntityManager(this.dataSource);

    // The On-time Arrival Rate's own population (AC-20b): Via Warehouse, dated, an ending that
    // recorded something. `noEndingRecordedLineCount` and `nothingReceivedLineCount` below name the
    // two ways a line falls out of it short of the verdict itself.
    const onTimeEligible =
      "line.deliveryMode = 'via_warehouse' AND line.endingRecordedAt IS NOT NULL AND line.endingQuantity > 0 AND draft.expectedArrivalDate IS NOT NULL";
    const onTimeDenominator = receiptLineAggregate(
      manager,
      'COUNT(*)::int',
      onTimeEligible,
    );
    const onTimeNumerator = receiptLineAggregate(
      manager,
      'COUNT(*)::int',
      `${onTimeEligible} AND (line.endingRecordedAt AT TIME ZONE :timezone)::date <= draft.expectedArrivalDate`,
    );
    const onTimeArrivalRatePercent = `CASE WHEN (${onTimeDenominator}) = 0 THEN NULL ELSE ROUND((${onTimeNumerator})::numeric * 100 / (${onTimeDenominator}), 2) END`;

    // The Conformance Rate's own population — every Delivery Mode, unlike the rate above. Both
    // exclusions are schema-decidable (`chk_purchase_draft_lines_conformance_requires_ending`,
    // `chk_purchase_draft_lines_pre_receipt_conformance_instruction`), so the predicate needs no
    // rule beyond the verdict column itself.
    const conformanceEligible =
      "line.preReceiptConformance IN ('met', 'not_met')";
    const conformanceDenominator = receiptLineAggregate(
      manager,
      'COUNT(*)::int',
      conformanceEligible,
    );
    const conformanceNumerator = receiptLineAggregate(
      manager,
      'COUNT(*)::int',
      `${conformanceEligible} AND line.preReceiptConformance = 'met'`,
    );
    const conformanceRatePercent = `CASE WHEN (${conformanceDenominator}) = 0 THEN NULL ELSE ROUND((${conformanceNumerator})::numeric * 100 / (${conformanceDenominator}), 2) END`;

    // `receivedQuantity` — Via Warehouse lines whose ending recorded something, including a `0`
    // ending (AC-20b), summed as the server-supplied absolute the client scales marks by.
    const receivedQuantity = receiptLineAggregate(
      manager,
      'COALESCE(SUM(line.endingQuantity), 0)::int',
      "line.deliveryMode = 'via_warehouse' AND line.endingRecordedAt IS NOT NULL",
    );

    const undatedLineCount = receiptLineAggregate(
      manager,
      'COUNT(*)::int',
      'draft.expectedArrivalDate IS NULL',
    );
    const noEndingRecordedLineCount = receiptLineAggregate(
      manager,
      'COUNT(*)::int',
      "line.deliveryMode = 'via_warehouse' AND line.endingRecordedAt IS NULL",
    );
    const nothingReceivedLineCount = receiptLineAggregate(
      manager,
      'COUNT(*)::int',
      "line.deliveryMode = 'via_warehouse' AND line.endingRecordedAt IS NOT NULL AND line.endingQuantity = 0",
    );
    const directToCustomerLineCount = receiptLineAggregate(
      manager,
      'COUNT(*)::int',
      "line.deliveryMode = 'direct_to_customer'",
    );
    const unrecordedConformanceLineCount = receiptLineAggregate(
      manager,
      'COUNT(*)::int',
      'line.preReceiptConformance IS NULL',
    );
    const notApplicableConformanceLineCount = receiptLineAggregate(
      manager,
      'COUNT(*)::int',
      "line.preReceiptConformance = 'not_applicable'",
    );

    const exclusionsJsonExpression = `json_build_object('undatedLineCount', (${undatedLineCount}), 'noEndingRecordedLineCount', (${noEndingRecordedLineCount}), 'nothingReceivedLineCount', (${nothingReceivedLineCount}), 'directToCustomerLineCount', (${directToCustomerLineCount}), 'unrecordedConformanceLineCount', (${unrecordedConformanceLineCount}), 'notApplicableConformanceLineCount', (${notApplicableConformanceLineCount}))`;

    const warehouses = manager
      .createQueryBuilder()
      .select(
        `COALESCE(json_agg(json_build_object('warehouseId', warehouse.id, 'warehouseName', warehouse.name, 'onTimeArrivalRatePercent', (${onTimeArrivalRatePercent}), 'conformanceRatePercent', (${conformanceRatePercent}), 'receivedQuantity', (${receivedQuantity}), 'exclusions', (${exclusionsJsonExpression})) ORDER BY warehouse.name, warehouse.id), '[]'::json)`,
      )
      .from(WarehouseEntity, 'warehouse')
      .where('warehouse.workspaceId = :workspaceId')
      .andWhere('warehouse.archivedAt IS NULL')
      .getQuery();

    const archivedWarehouseCount = archivedWarehouseCountSubquery(
      manager,
      workspaceId,
    );

    const row = await manager
      .getRepository(WorkspaceEntity)
      .createQueryBuilder('workspace')
      .select(`(${archivedWarehouseCount})`, 'archivedWarehouseCount')
      .addSelect(`(${warehouses})`, 'warehouses')
      .where('workspace.id = :workspaceId', { workspaceId })
      .setParameters({ timezone })
      .getRawOne<PanelRow<ReceiptReliabilityWarehouseRead>>();

    return {
      archivedWarehouseCount: row?.archivedWarehouseCount ?? 0,
      warehouses: row?.warehouses ?? [],
    };
  }
}
