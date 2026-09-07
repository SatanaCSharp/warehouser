import { Column, Entity, PrimaryColumn } from 'typeorm';

// The Customer a Warehouse owns (`data-model.md` §`customers`, AC-01). The aggregate root: the name
// is unique within its Warehouse, active or Inactive alike, and nothing anywhere denormalizes it —
// which is what makes correcting it change every record that names the Customer (AC-03b).
@Entity({ name: 'customers' })
export class CustomerEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'warehouse_id' })
  warehouseId!: string;

  @Column('text')
  name!: string;

  // Withdrawn, reversibly, at a known time — the shape `warehouses.archived_at` and
  // `items.deactivated_at` already use. Reactivation clears it (AC-06).
  @Column('timestamptz', { name: 'deactivated_at', nullable: true })
  deactivatedAt!: Date | null;

  @Column('uuid', { name: 'recorded_by_user_id' })
  recordedByUserId!: string;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
