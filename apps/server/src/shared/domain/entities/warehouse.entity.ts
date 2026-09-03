import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'warehouses' })
export class WarehouseEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'workspace_id' })
  workspaceId!: string;

  @Column('text')
  name!: string;

  @Column('timestamptz', { name: 'archived_at', nullable: true })
  archivedAt!: Date | null;

  // The Warehouse's one Delivery Address and its access notes (AC-10, `data-model.md` §`warehouses`).
  // Columns rather than a `customer_delivery_addresses` row: a Warehouse has exactly one address,
  // corrects it in place, never marks it Main and never makes it Inactive. Both are null until
  // recorded, which is the state a freeze of a Via Warehouse line is refused from (AC-16a), and the
  // notes never stand without the address.
  @Column('text', { name: 'delivery_address_text', nullable: true })
  deliveryAddressText!: string | null;

  @Column('text', { name: 'delivery_access_notes', nullable: true })
  deliveryAccessNotes!: string | null;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
