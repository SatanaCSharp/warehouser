import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'purchase_draft_lines' })
export class PurchaseDraftLineEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'purchase_draft_id' })
  purchaseDraftId!: string;

  @Column('uuid', { name: 'warehouse_id' })
  warehouseId!: string;

  @Column('uuid', { name: 'item_id' })
  itemId!: string;

  @Column('integer', { name: 'ordered_quantity' })
  orderedQuantity!: number;

  @Column('varchar', { name: 'packaging_type_id', length: 32, nullable: true })
  packagingTypeId!: string | null;

  @Column('text', { name: 'value_adding_note', nullable: true })
  valueAddingNote!: string | null;

  @Column('integer', { name: 'received_quantity', nullable: true })
  receivedQuantity!: number | null;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
