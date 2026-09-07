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

  // Which Delivery Address the linked Customer Order was going to at the freeze, and how that
  // address read at that moment (AC-16, AC-18). The identifier is the comparison key Address Drift
  // is decided on — an identity comparison, so correcting a typo in an address is not a redirection
  // — and the text is what the member is shown beside the address the demand now expects. Both are
  // captured together or not at all: a link to a Customer Order recorded by typed name names no
  // address (AC-11a, AC-15b).
  @Column('uuid', {
    name: 'captured_customer_delivery_address_id',
    nullable: true,
  })
  capturedCustomerDeliveryAddressId!: string | null;

  @Column('text', { name: 'captured_delivery_address_text', nullable: true })
  capturedDeliveryAddressText!: string | null;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;
}
