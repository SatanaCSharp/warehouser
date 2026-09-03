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

  // The Customer this demand names, and the one of that Customer's Delivery Addresses it is going to
  // (AC-11, `data-model.md` §`customer_orders`). `chk_customer_orders_customer_identity` admits
  // exactly two shapes: a Customer with one of its addresses and no typed name, or a typed name with
  // neither — which is why all three columns are nullable and none of them is nullable
  // independently.
  @Column('uuid', { name: 'customer_id', nullable: true })
  customerId!: string | null;

  @Column('uuid', { name: 'customer_delivery_address_id', nullable: true })
  customerDeliveryAddressId!: string | null;

  // The typed-name column only, since this release (AC-11a, AC-24). An order naming a Customer reads
  // that name live from `customers` and carries none here, which is what makes correcting a
  // Customer's name change every order that names it without rewriting a row (AC-03b). Every order
  // `ordering` shipped keeps its typed name untouched.
  @Column('text', { name: 'customer_name', nullable: true })
  customerName!: string | null;

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
