import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'purchase_drafts' })
export class PurchaseDraftEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'warehouse_id' })
  warehouseId!: string;

  // The human reference every card, detail header and dialog title names the draft by — `PD-0143`
  // (design frames `yGhkK.png`, `s5EPi.png`). Minted by the column DEFAULT over
  // `purchase_draft_reference_seq` (`1786600200000-AddPurchaseDraftReference.ts`), so the database
  // is the single writer: `insert`/`update` are off, which keeps every write path from minting,
  // skipping or overwriting one. Optional on the TypeScript side for the same reason — the column
  // is NOT NULL and every row read carries it, but no application code ever supplies one, so an
  // entity value composed in memory before its INSERT legitimately has none yet.
  @Column({ type: 'text', insert: false, update: false })
  reference?: string;

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
