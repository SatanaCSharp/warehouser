import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { ItemStockAdjustmentEntity } from 'shared/domain/entities/item-stock-adjustment.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { DataSource, EntityManager } from 'typeorm';

export interface CreateItemPersistenceInput {
  readonly id: string;
  readonly warehouseId: string;
  readonly sku: string;
  readonly description: string;
  readonly unitOfMeasure: string;
  readonly onHandQuantity?: number;
  readonly deactivatedAt?: Date | null;
}

export interface UpdateItemDetailsInput {
  readonly description: string;
  readonly unitOfMeasure: string;
}

export interface ItemWithOnHandAndLatestReasonRead {
  readonly id: string;
  readonly sku: string;
  readonly description: string;
  readonly unitOfMeasure: string;
  readonly onHandQuantity: number;
  readonly deactivatedAt: Date | null;
  // AC-06c — how many Customer Orders and how many Purchase Draft Lines name this Item, counted by
  // exactly the conditions `isNamedByDemandOrDraft` enforces the SKU rule with (see
  // `namingSubqueries` below).
  readonly namingCustomerOrderCount: number;
  readonly namingPurchaseDraftLineCount: number;
  readonly latestAdjustmentReason: string | null;
  readonly latestAdjustmentQuantity: number | null;
  readonly latestAdjustedByUserId: string | null;
  readonly latestAdjustedAt: Date | null;
  readonly createdAt: Date;
}

export interface FindItemsWithOnHandOptions {
  /** Narrows the result to one Item — the full-projection read a mutating REST handler confirms
   * from after a write (T7). Optional so the existing whole-Warehouse read is unaffected. */
  readonly itemId?: string;
  /** AC-06a — the picker read: only Items that are not deactivated. */
  readonly activeOnly?: boolean;
}

// AC-06c — the one definition of "something names this Item": any row of `customer_orders` or of
// `purchase_draft_lines` carrying its id, whatever state that Customer Order or that Purchase Draft
// is in. A cancelled order and a discarded draft still name it — AC-06c fixes the SKU "for the life
// of that item", and AC-06d's "keeps its SKU taken so no new Item may reuse it" is the same
// permanence read from the other side.
//
// Both consumers below are built from this one pair of subqueries on purpose: the counts the Items
// table displays (`Named by 3 customer orders and 1 draft line`) and the rule `CorrectItemCommand`
// refuses a SKU correction with are then built from the same two tables and the same two `WHERE`
// clauses, so the figure a member reads and the answer they get on attempting the correction cannot
// drift apart. `itemReference` is whatever the enclosing query names the Item by — the outer
// `item.id` column for the correlated per-row counts, a bound `:itemId` for the single-Item check.
//
// What the two consumers do *not* share is the projection, and deliberately. The rule only asks
// whether a naming row exists, so it selects `1` and is wrapped in `EXISTS`, which Postgres stops
// at the first matching row; the list read needs the actual figures, so it selects `COUNT(*)`,
// which cannot stop early. Sharing the count expression as well would have made a write-path check
// scan every naming row on both tables to compute a total it then only compares against zero. What
// carries the risk of drift is the *definition* — which tables count as naming, and on what
// predicate — and that is what stays in one place here.
const namingSubqueries = (
  manager: EntityManager,
  itemReference: string,
  selection: string,
): { customerOrders: string; purchaseDraftLines: string } => ({
  customerOrders: manager
    .createQueryBuilder()
    .select(selection)
    .from(CustomerOrderEntity, 'namingCustomerOrder')
    .where(`namingCustomerOrder.itemId = ${itemReference}`)
    .getQuery(),
  purchaseDraftLines: manager
    .createQueryBuilder()
    .select(selection)
    .from(PurchaseDraftLineEntity, 'namingPurchaseDraftLine')
    .where(`namingPurchaseDraftLine.itemId = ${itemReference}`)
    .getQuery(),
});

/** The displayed figures (AC-06c: `Named by 3 customer orders and 1 draft line`). */
const namingCounts = (
  manager: EntityManager,
  itemReference: string,
): { customerOrders: string; purchaseDraftLines: string } =>
  namingSubqueries(manager, itemReference, 'COUNT(*)::int');

/** The enforcement form of the same definition: existence, short-circuited at the first row. */
const namingExistence = (
  manager: EntityManager,
  itemReference: string,
): { customerOrders: string; purchaseDraftLines: string } =>
  namingSubqueries(manager, itemReference, '1');

// AC-06/AC-06b/AC-06c/AC-06d/AC-07/AC-07a — the Item catalogue: SKU uniqueness within a Warehouse,
// activation, correction, and the two read projections the Item queries need. data-model.md
// "Repository boundaries" and tasks/item-catalogue-domain.md require `isNamedByDemandOrDraft` and
// `findItemsWithOnHandAndLatestReason` to answer in one query each, per
// creating-a-server-repository.md ("Prefer one purpose-built query over retrieving records
// separately and joining or filtering them in application memory").
@Injectable()
export class ItemCatalogueRepository {
  constructor(private readonly dataSource: DataSource) {}

  // AC-06 — a new Item starts active with nothing on hand; `uq_items_warehouse_sku` is left to
  // reject a duplicate SKU within the Warehouse (AC-07), which the caller lets propagate.
  async createItem(input: CreateItemPersistenceInput): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    const now = new Date();

    await manager.getRepository(ItemEntity).insert({
      id: input.id,
      warehouseId: input.warehouseId,
      sku: input.sku,
      description: input.description,
      unitOfMeasure: input.unitOfMeasure,
      onHandQuantity: input.onHandQuantity ?? 0,
      deactivatedAt: input.deactivatedAt ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // `uq_items_warehouse_sku` — a SKU identifies at most one Item per Warehouse (AC-07, AC-07a).
  findBySku(warehouseId: string, sku: string): Promise<ItemEntity | null> {
    return getEntityManager(this.dataSource)
      .getRepository(ItemEntity)
      .findOneBy({ warehouseId, sku });
  }

  findById(itemId: string): Promise<ItemEntity | null> {
    return getEntityManager(this.dataSource)
      .getRepository(ItemEntity)
      .findOneBy({ id: itemId });
  }

  // AC-06c — "is this Item already named by any Customer Order or any Purchase Draft Line",
  // answered in exactly one round trip: both halves are embedded as correlated subqueries in one
  // outer `SELECT`, never issued as two separate queries. They come from `namingSubqueries` — the
  // same definition `findItemsWithOnHandAndLatestReason` reports the displayed counts from — so the
  // rule enforced here and the counts shown in the Items table stay one rule. `EXISTS … OR EXISTS`
  // rather than a sum: this path only needs to know whether a naming row is there, and Postgres
  // stops each subquery at its first matching row and never evaluates the second when the first
  // already answered.
  isNamedByDemandOrDraft(itemId: string): Promise<boolean> {
    const manager = getEntityManager(this.dataSource);
    const naming = namingExistence(manager, ':itemId');

    return manager
      .createQueryBuilder()
      .select(
        `EXISTS (${naming.customerOrders}) OR EXISTS (${naming.purchaseDraftLines})`,
        'named',
      )
      .from(ItemEntity, 'item')
      .where('item.id = :itemId', { itemId })
      .getRawOne<{ named: boolean }>()
      .then((row) => row?.named ?? false);
  }

  // AC-06b — description and Unit of Measure are always correctable; the Item's id, and therefore
  // every reference to it, is untouched.
  async updateItemDetails(
    itemId: string,
    details: UpdateItemDetailsInput,
  ): Promise<void> {
    const manager = getEntityManager(this.dataSource);

    await manager
      .getRepository(ItemEntity)
      .update({ id: itemId }, { ...details, updatedAt: new Date() });
  }

  // AC-06c — only reached once the caller has confirmed the Item is still unnamed; a duplicate
  // target SKU is left to `uq_items_warehouse_sku` and the caller's own `findBySku` check.
  async updateSku(itemId: string, sku: string): Promise<void> {
    const manager = getEntityManager(this.dataSource);

    await manager
      .getRepository(ItemEntity)
      .update({ id: itemId }, { sku, updatedAt: new Date() });
  }

  // AC-06d — deactivation/reactivation write only `deactivated_at`; the SKU column, and therefore
  // `uq_items_warehouse_sku`'s reservation of it, is never touched.
  async setDeactivatedAt(
    itemId: string,
    deactivatedAt: Date | null,
  ): Promise<void> {
    const manager = getEntityManager(this.dataSource);

    await manager
      .getRepository(ItemEntity)
      .update({ id: itemId }, { deactivatedAt, updatedAt: new Date() });
  }

  // AC-06a — the active Items of a Warehouse, offered when demand is recorded and when a draft is
  // assembled.
  findActiveItemsForPicker(warehouseId: string): Promise<ItemEntity[]> {
    return getEntityManager(this.dataSource)
      .getRepository(ItemEntity)
      .createQueryBuilder('item')
      .where('item.warehouseId = :warehouseId', { warehouseId })
      .andWhere('item.deactivatedAt IS NULL')
      .orderBy('item.sku', 'ASC')
      .getMany();
  }

  // The Warehouse's Items with their on-hand figure, their LATEST adjustment (AC-08's
  // consolidated-figure read) and what names them (AC-06c), in exactly one round trip regardless of
  // Item, adjustment, order or draft-line count: the latest reason, quantity, member and instant,
  // and both naming counts, are each a correlated subquery embedded in the outer `SELECT`, never a
  // per-Item follow-up query. `options.itemId` narrows to one Item — reused by
  // T7's REST handlers to confirm the full `Item` projection a mutation just wrote — and
  // `options.activeOnly` is the AC-06a picker filter; both stay additive so the unfiltered call
  // this method already served is unaffected.
  findItemsWithOnHandAndLatestReason(
    warehouseId: string,
    options: FindItemsWithOnHandOptions = {},
  ): Promise<ItemWithOnHandAndLatestReasonRead[]> {
    const manager = getEntityManager(this.dataSource);

    const latestAdjustmentBase = () =>
      manager
        .createQueryBuilder()
        .from(ItemStockAdjustmentEntity, 'adjustment')
        .where('adjustment.itemId = item.id')
        .orderBy('adjustment.createdAt', 'DESC')
        .limit(1);

    const latestAdjustmentReason = latestAdjustmentBase()
      .select('adjustment.reason')
      .getQuery();
    const latestAdjustmentQuantity = latestAdjustmentBase()
      .select('adjustment.countedQuantity')
      .getQuery();
    // AC-08 — "the reason, the acting member, and the time"; the Items table's On hand reason line
    // states all three (`24 Aug · cycle count · by you`, design frame `XIvAZ.png`).
    const latestAdjustedByUserId = latestAdjustmentBase()
      .select('adjustment.adjustedByUserId')
      .getQuery();
    const latestAdjustedAt = latestAdjustmentBase()
      .select('adjustment.createdAt')
      .getQuery();

    // AC-06c — counted by the same conditions `isNamedByDemandOrDraft` enforces the SKU rule with,
    // as correlated subqueries so the round-trip count stays one regardless of Item count. This
    // consumer is the one that genuinely needs the figures, so it takes the counting projection.
    const naming = namingCounts(manager, 'item.id');

    let query = manager
      .getRepository(ItemEntity)
      .createQueryBuilder('item')
      .select('item.id', 'id')
      .addSelect('item.sku', 'sku')
      .addSelect('item.description', 'description')
      .addSelect('item.unitOfMeasure', 'unitOfMeasure')
      .addSelect('item.onHandQuantity', 'onHandQuantity')
      .addSelect('item.deactivatedAt', 'deactivatedAt')
      .addSelect('item.createdAt', 'createdAt')
      .addSelect(`(${naming.customerOrders})`, 'namingCustomerOrderCount')
      .addSelect(
        `(${naming.purchaseDraftLines})`,
        'namingPurchaseDraftLineCount',
      )
      .addSelect(`(${latestAdjustmentReason})`, 'latestAdjustmentReason')
      .addSelect(`(${latestAdjustmentQuantity})`, 'latestAdjustmentQuantity')
      .addSelect(`(${latestAdjustedByUserId})`, 'latestAdjustedByUserId')
      .addSelect(`(${latestAdjustedAt})`, 'latestAdjustedAt')
      .where('item.warehouseId = :warehouseId', { warehouseId });

    if (options.itemId !== undefined) {
      query = query.andWhere('item.id = :itemId', { itemId: options.itemId });
    }
    if (options.activeOnly) {
      query = query.andWhere('item.deactivatedAt IS NULL');
    }

    return query
      .orderBy('item.sku', 'ASC')
      .getRawMany<ItemWithOnHandAndLatestReasonRead>();
  }
}
