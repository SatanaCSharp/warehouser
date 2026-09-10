import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { DataSource } from 'typeorm';

// openapi.yaml `DemandCoverage` — one entry per link (never aggregated per draft).
// `purchaseDraftState` only ever admits `draft`/`ready_for_ordering`: a Closed or Discarded
// draft's links are excluded at the query's own WHERE, never mapped to a closed/discarded value.
export interface ConsolidatedDemandCoverageRead {
  readonly purchaseDraftId: string;
  // AC-20 — the human reference the `COVERED BY` chip names the draft by (`PD-0142 · 800`). Joined
  // through from `purchase_drafts.reference`, which is NOT NULL and minted by the column DEFAULT.
  readonly purchaseDraftReference: string;
  readonly purchaseDraftLineId: string;
  readonly purchaseDraftState: 'draft' | 'ready_for_ordering';
  readonly statedQuantity: number;
}

// openapi.yaml `DemandLine`.
export interface ConsolidatedDemandLineRead {
  readonly itemId: string;
  readonly sku: string;
  readonly description: string;
  readonly unitOfMeasure: string;
  readonly totalOutstandingQuantity: number;
  readonly earliestNeededBy: string;
  readonly onHandQuantity: number;
  readonly unfulfilledCustomerOrderCount: number;
  readonly coverage: readonly ConsolidatedDemandCoverageRead[];
}

interface ConsolidatedDemandRawRow {
  readonly itemId: string;
  readonly sku: string;
  readonly description: string;
  readonly unitOfMeasure: string;
  readonly onHandQuantity: number;
  readonly totalOutstandingQuantity: number;
  readonly earliestNeededBy: string;
  readonly unfulfilledCustomerOrderCount: number;
  readonly coverage: readonly ConsolidatedDemandCoverageRead[];
}

// AC-04/AC-17a/AC-20/AC-21a — the consolidated demand read. `sad.md` §6.5 and data-model.md "The
// non-fan-out requirement" require the two independent one-to-many aggregations — Customer Orders
// per Item, and links per Customer Order — to be aggregated **separately and then joined**, never
// combined in one `GROUP BY` over both. This method answers with correlated scalar/array subqueries
// per Item row instead: each aggregate (Outstanding Quantity total, earliest needed-by, order
// count, Coverage) is computed in its own subquery context and can never be multiplied by the row
// count of another. It is one outer `SELECT` and therefore one round trip
// (creating-a-server-repository.md, "Prefer one purpose-built query").
@Injectable()
export class ConsolidatedDemandRepository {
  constructor(private readonly dataSource: DataSource) {}

  readConsolidatedDemand(
    warehouseId: string,
  ): Promise<ConsolidatedDemandLineRead[]> {
    const manager = getEntityManager(this.dataSource);

    // AC-04 — only Unfulfilled Customer Orders ever contribute; Fulfilled and cancelled ones are
    // excluded by this shared condition wherever it is repeated below.
    const unfulfilledDemandCondition =
      "demand.itemId = item.id AND demand.warehouseId = :warehouseId AND demand.state = 'unfulfilled'";

    const totalOutstandingQuantity = manager
      .createQueryBuilder()
      .select('COALESCE(SUM(demand.outstandingQuantity), 0)::int')
      .from(CustomerOrderEntity, 'demand')
      .where(unfulfilledDemandCondition)
      .getQuery();

    const earliestNeededBy = manager
      .createQueryBuilder()
      .select('MIN(demand.neededBy)::text')
      .from(CustomerOrderEntity, 'demand')
      .where(unfulfilledDemandCondition)
      .getQuery();

    const unfulfilledCustomerOrderCount = manager
      .createQueryBuilder()
      .select('COUNT(*)::int')
      .from(CustomerOrderEntity, 'demand')
      .where(unfulfilledDemandCondition)
      .getQuery();

    const hasUnfulfilledDemand = manager
      .createQueryBuilder()
      .select('1')
      .from(CustomerOrderEntity, 'demand')
      .where(unfulfilledDemandCondition)
      .getQuery();

    // AC-20/AC-21a — every link whose Customer Order belongs to this Item and is still
    // Unfulfilled, and whose draft is neither Closed nor Discarded; one Coverage entry per link,
    // never aggregated per draft.
    const coverage = manager
      .createQueryBuilder()
      .select(
        // One line, and long because of it: prettier would otherwise wrap this expression, and a
        // wrapped `alias.property` is harder to read against the raw SQL TypeORM emits for it than
        // a single over-long string is. (An earlier note here claimed a trailing newline defeats
        // TypeORM's `alias.property` replacement — it does not: the pattern is compiled `gm`, so
        // `^` and `$` match at every line boundary.)
        "COALESCE(json_agg(json_build_object('purchaseDraftId', draft.id, 'purchaseDraftReference', draft.reference, 'purchaseDraftLineId', line.id, 'purchaseDraftState', draft.state, 'statedQuantity', link.statedQuantity)), '[]'::json)",
      )
      .from(PurchaseDraftLineLinkEntity, 'link')
      .innerJoin(
        CustomerOrderEntity,
        'coverageOrder',
        'coverageOrder.id = link.customerOrderId',
      )
      .innerJoin(
        PurchaseDraftLineEntity,
        'line',
        'line.id = link.purchaseDraftLineId',
      )
      .innerJoin(
        PurchaseDraftEntity,
        'draft',
        'draft.id = link.purchaseDraftId',
      )
      .where('coverageOrder.itemId = item.id')
      .andWhere('coverageOrder.warehouseId = :warehouseId')
      .andWhere("coverageOrder.state = 'unfulfilled'")
      .andWhere("draft.state IN ('draft', 'ready_for_ordering')")
      .getQuery();

    return (
      manager
        .getRepository(ItemEntity)
        .createQueryBuilder('item')
        .select('item.id', 'itemId')
        .addSelect('item.sku', 'sku')
        .addSelect('item.description', 'description')
        .addSelect('item.unitOfMeasure', 'unitOfMeasure')
        .addSelect('item.onHandQuantity', 'onHandQuantity')
        .addSelect(`(${totalOutstandingQuantity})`, 'totalOutstandingQuantity')
        .addSelect(`(${earliestNeededBy})`, 'earliestNeededBy')
        .addSelect(
          `(${unfulfilledCustomerOrderCount})`,
          'unfulfilledCustomerOrderCount',
        )
        .addSelect(`(${coverage})`, 'coverage')
        .where('item.warehouseId = :warehouseId', { warehouseId })
        .andWhere(`EXISTS (${hasUnfulfilledDemand})`)
        // openapi.yaml `readConsolidatedDemand` 200 — "ordered by earliest needed-by date then SKU",
        // so the Item needed soonest leads regardless of its SKU and the SKU only breaks a tie.
        // `earliestNeededBy` is a correlated-subquery select alias rather than a column of `item`, so
        // it is ordered by its quoted alias; a bare `earliestNeededBy` would be resolved by TypeORM's
        // `alias.property` handling and not by PostgreSQL's output-column name.
        .orderBy('"earliestNeededBy"', 'ASC')
        .addOrderBy('item.sku', 'ASC')
        .getRawMany<ConsolidatedDemandRawRow>()
    );
  }
}
