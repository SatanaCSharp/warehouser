import { Column, Entity, PrimaryColumn } from 'typeorm';

// Where a Customer's goods may be sent (`data-model.md` §`customer_delivery_addresses`, AC-04). It
// has no life apart from the Customer that owns it.
//
// `warehouse_id` is carried rather than derived: it is half of the composite reference
// `(customer_id, warehouse_id)` into `customers`, which is what proves an address belongs to exactly
// one Customer of exactly one Warehouse, and half of the `(id, warehouse_id)` target a Direct to
// Customer Purchase Draft Line names (AC-12).
//
// The Warehouse's own Delivery Address is deliberately not a row here — it is columns on
// `warehouses`, because it is corrected in place, is never Main and is never made Inactive.
@Entity({ name: 'customer_delivery_addresses' })
export class CustomerDeliveryAddressEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'customer_id' })
  customerId!: string;

  @Column('uuid', { name: 'warehouse_id' })
  warehouseId!: string;

  // Text a member types; the product never interprets it (`spec.md` §3).
  @Column('text', { name: 'address_text' })
  addressText!: string;

  // Gate codes and delivery windows — confidential (`sad.md` §8).
  @Column('text', { name: 'access_notes', nullable: true })
  accessNotes!: string | null;

  // At most one per Customer, enforced by a partial unique index, and never set on an Inactive
  // address (AC-05, AC-06b).
  @Column('boolean', { name: 'is_main' })
  isMain!: boolean;

  @Column('timestamptz', { name: 'deactivated_at', nullable: true })
  deactivatedAt!: Date | null;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
