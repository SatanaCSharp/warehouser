import { Column, Entity, PrimaryColumn } from 'typeorm';

// `chk_customer_orders_state` — the three states the column admits. Declared beside the column
// because it is a persistence-oriented value, not a feature concept: both `shared/domain/
// repositories/` and the `customer-orders` module read it without either depending on the other
// (server-architecture.md §Dependency direction).
export type CustomerOrderState = 'unfulfilled' | 'fulfilled' | 'cancelled';

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
  state!: CustomerOrderState;

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
