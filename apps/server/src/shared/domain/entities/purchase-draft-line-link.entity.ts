import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'purchase_draft_line_links' })
export class PurchaseDraftLineLinkEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'purchase_draft_line_id' })
  purchaseDraftLineId!: string;

  @Column('uuid', { name: 'purchase_draft_id' })
  purchaseDraftId!: string;

  @Column('uuid', { name: 'warehouse_id' })
  warehouseId!: string;

  @Column('uuid', { name: 'customer_order_id' })
  customerOrderId!: string;

  @Column('integer', { name: 'stated_quantity' })
  statedQuantity!: number;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
