import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service.js';
import { ItemEntity } from 'shared/domain/entities/item.entity.js';
import { ItemStockAdjustmentEntity } from 'shared/domain/entities/item-stock-adjustment.entity.js';
import { DataSource } from 'typeorm';

export interface RecordOnHandAdjustmentInput {
  readonly adjustmentId: string;
  readonly itemId: string;
  readonly warehouseId: string;
  readonly countedQuantity: number;
  readonly reason: string;
  readonly adjustedByUserId: string;
  readonly adjustedAt: Date;
}

// AC-08/AC-09a — the one write path to an Item's On-hand Quantity (AC-18a). `sad.md` §6.3 requires
// the Item's new figure and its immutable adjustment row to be written "atomically as a pair", so
// this is one cohesive persistence operation across two entities rather than two table-shaped
// methods a caller has to coordinate — creating-a-server-repository.md, "Prefer one cohesive write
// method over exposing a sequence of table-shaped methods". The transaction is the caller's: the
// shared context supplies the manager, and `OnHandAdjustmentService.adjust` carries
// `@Transactional()`.
@Injectable()
export class ItemStockAdjustmentRepository {
  constructor(private readonly dataSource: DataSource) {}

  // The figure is **set to the count**, never derived from the figure already stored
  // (CONTEXT.md §Invariants), so the previous value is neither read nor referenced. The update is
  // scoped to `(id, warehouse_id)` for the same reason the adjustment row carries `warehouse_id`:
  // `fk_item_stock_adjustments_item` makes an Item of another Warehouse unwritable either way.
  async recordAdjustment(input: RecordOnHandAdjustmentInput): Promise<void> {
    const manager = getEntityManager(this.dataSource);

    await manager
      .getRepository(ItemEntity)
      .update(
        { id: input.itemId, warehouseId: input.warehouseId },
        { onHandQuantity: input.countedQuantity, updatedAt: input.adjustedAt },
      );

    await manager.getRepository(ItemStockAdjustmentEntity).insert({
      id: input.adjustmentId,
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      countedQuantity: input.countedQuantity,
      reason: input.reason,
      adjustedByUserId: input.adjustedByUserId,
      createdAt: input.adjustedAt,
    });
  }
}
