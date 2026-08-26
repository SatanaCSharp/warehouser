import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { ItemStockAdjustmentEntity } from 'shared/domain/entities/item-stock-adjustment.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { DataSource } from 'typeorm';

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
  readonly latestAdjustmentReason: string | null;
  readonly latestAdjustmentQuantity: number | null;
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
  // answered in exactly one round trip: both existence checks are embedded as correlated
  // subqueries in one outer `SELECT`, never issued as two separate queries.
  isNamedByDemandOrDraft(itemId: string): Promise<boolean> {
    const manager = getEntityManager(this.dataSource);

    const namedByCustomerOrder = manager
      .createQueryBuilder()
      .select('1')
      .from(CustomerOrderEntity, 'customerOrder')
      .where('customerOrder.itemId = :itemId')
      .getQuery();

    const namedByPurchaseDraftLine = manager
      .createQueryBuilder()
      .select('1')
      .from(PurchaseDraftLineEntity, 'purchaseDraftLine')
      .where('purchaseDraftLine.itemId = :itemId')
      .getQuery();

    return manager
      .createQueryBuilder()
      .select(
        `EXISTS (${namedByCustomerOrder}) OR EXISTS (${namedByPurchaseDraftLine})`,
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

  // The Warehouse's Items with their on-hand figure and their LATEST adjustment reason (AC-08's
  // consolidated-figure read), in exactly one round trip regardless of Item or adjustment count:
  // the latest reason, quantity and instant are each a correlated subquery embedded in the outer
  // `SELECT`, never a per-Item follow-up query. `options.itemId` narrows to one Item — reused by
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
    const latestAdjustedAt = latestAdjustmentBase()
      .select('adjustment.createdAt')
      .getQuery();

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
      .addSelect(`(${latestAdjustmentReason})`, 'latestAdjustmentReason')
      .addSelect(`(${latestAdjustmentQuantity})`, 'latestAdjustmentQuantity')
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
