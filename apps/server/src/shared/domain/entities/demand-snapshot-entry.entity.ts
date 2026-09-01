import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'purchase_draft_demand_snapshots' })
export class DemandSnapshotEntryEntity {
  @PrimaryColumn('uuid', { name: 'purchase_draft_line_link_id' })
  purchaseDraftLineLinkId!: string;

  @Column('uuid', { name: 'purchase_draft_line_id' })
  purchaseDraftLineId!: string;

  @Column('uuid', { name: 'customer_order_id' })
  customerOrderId!: string;

  @Column('integer', { name: 'captured_quantity' })
  capturedQuantity!: number;

  @Column('date', { name: 'captured_needed_by' })
  capturedNeededBy!: string;

  @Column('varchar', { name: 'captured_state', length: 16 })
  capturedState!: string;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;
}
