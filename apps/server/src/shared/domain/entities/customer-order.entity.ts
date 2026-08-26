import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'customer_orders' })
export class CustomerOrderEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'warehouse_id' })
  warehouseId!: string;

  @Column('uuid', { name: 'item_id' })
  itemId!: string;

  @Column('text', { name: 'customer_name' })
  customerName!: string;

  @Column('integer')
  quantity!: number;

  @Column('integer', { name: 'outstanding_quantity' })
  outstandingQuantity!: number;

  @Column('date', { name: 'needed_by' })
  neededBy!: string;

  @Column('varchar', { length: 16 })
  state!: string;

  @Column('text', { name: 'cancellation_reason', nullable: true })
  cancellationReason!: string | null;

  @Column('uuid', { name: 'recorded_by_user_id' })
  recordedByUserId!: string;

  @Column('uuid', { name: 'cancelled_by_user_id', nullable: true })
  cancelledByUserId!: string | null;

  @Column('timestamptz', { name: 'cancelled_at', nullable: true })
  cancelledAt!: Date | null;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
