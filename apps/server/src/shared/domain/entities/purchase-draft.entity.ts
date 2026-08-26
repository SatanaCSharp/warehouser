import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'purchase_drafts' })
export class PurchaseDraftEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'warehouse_id' })
  warehouseId!: string;

  @Column('varchar', { length: 24 })
  state!: string;

  @Column('date', { name: 'expected_arrival_date', nullable: true })
  expectedArrivalDate!: string | null;

  @Column('uuid', { name: 'created_by_user_id' })
  createdByUserId!: string;

  @Column('uuid', { name: 'readied_by_user_id', nullable: true })
  readiedByUserId!: string | null;

  @Column('timestamptz', { name: 'readied_at', nullable: true })
  readiedAt!: Date | null;

  @Column('uuid', { name: 'closed_by_user_id', nullable: true })
  closedByUserId!: string | null;

  @Column('timestamptz', { name: 'closed_at', nullable: true })
  closedAt!: Date | null;

  @Column('text', { name: 'closure_reason', nullable: true })
  closureReason!: string | null;

  @Column('uuid', { name: 'arrival_confirmed_by_user_id', nullable: true })
  arrivalConfirmedByUserId!: string | null;

  @Column('timestamptz', { name: 'arrival_confirmed_at', nullable: true })
  arrivalConfirmedAt!: Date | null;

  @Column('uuid', { name: 'discarded_by_user_id', nullable: true })
  discardedByUserId!: string | null;

  @Column('timestamptz', { name: 'discarded_at', nullable: true })
  discardedAt!: Date | null;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
