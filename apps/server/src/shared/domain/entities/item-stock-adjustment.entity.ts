import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'item_stock_adjustments' })
export class ItemStockAdjustmentEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'item_id' })
  itemId!: string;

  @Column('uuid', { name: 'warehouse_id' })
  warehouseId!: string;

  @Column('integer', { name: 'counted_quantity' })
  countedQuantity!: number;

  @Column('text')
  reason!: string;

  @Column('uuid', { name: 'adjusted_by_user_id' })
  adjustedByUserId!: string;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;
}
