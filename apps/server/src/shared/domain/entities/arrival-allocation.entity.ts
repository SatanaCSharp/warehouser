import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'arrival_allocations' })
export class ArrivalAllocationEntity {
  @PrimaryColumn('uuid', { name: 'purchase_draft_line_link_id' })
  purchaseDraftLineLinkId!: string;

  @Column('uuid', { name: 'purchase_draft_line_id' })
  purchaseDraftLineId!: string;

  @Column('uuid', { name: 'customer_order_id' })
  customerOrderId!: string;

  @Column('integer', { name: 'allocated_quantity' })
  allocatedQuantity!: number;

  @Column('uuid', { name: 'allocated_by_user_id' })
  allocatedByUserId!: string;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;
}
