import { Column, Entity, PrimaryColumn } from 'typeorm';

// `chk_purchase_draft_lines_delivery_mode` — the two ways a line's goods travel. Declared beside the
// column because it is a persistence-oriented value, exactly as `CustomerOrderState` is: both
// `shared/domain/repositories/` and the `purchase-drafts` module read it without either depending on
// the other (server-architecture.md §Dependency direction).
export type PurchaseDraftLineDeliveryMode =
  'via_warehouse' | 'direct_to_customer';

// `chk_purchase_draft_lines_ending_kind` — how a line ended. An arrival belongs to a Via Warehouse
// line and a direct delivery to a Direct to Customer one, which the schema enforces (AC-20).
export type PurchaseDraftLineEndingKind = 'arrival' | 'direct_delivery';

@Entity({ name: 'purchase_draft_lines' })
export class PurchaseDraftLineEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'purchase_draft_id' })
  purchaseDraftId!: string;

  @Column('uuid', { name: 'warehouse_id' })
  warehouseId!: string;

  @Column('uuid', { name: 'item_id' })
  itemId!: string;

  @Column('integer', { name: 'ordered_quantity' })
  orderedQuantity!: number;

  @Column('varchar', { name: 'packaging_type_id', length: 32, nullable: true })
  packagingTypeId!: string | null;

  @Column('text', { name: 'value_adding_note', nullable: true })
  valueAddingNote!: string | null;

  // How this line's goods travel (AC-13). Every line starts Via Warehouse, which is the behaviour
  // every line had before this release.
  @Column('varchar', { name: 'delivery_mode', length: 24 })
  deliveryMode!: PurchaseDraftLineDeliveryMode;

  // The live destination, held only while the line is still editable and named by a Direct to
  // Customer line alone — a Via Warehouse line's destination *is* the Warehouse's own address, which
  // has no identifier this column could hold (AC-14).
  @Column('uuid', { name: 'customer_delivery_address_id', nullable: true })
  customerDeliveryAddressId!: string | null;

  // The Delivery Address as it read at Ready for Ordering — values, not a reference, so no later
  // edit in place can travel into what the supplier was told (AC-16, AC-17). The three are one
  // statement made at one moment; only the freeze command writes them.
  @Column('text', { name: 'frozen_delivery_address_text', nullable: true })
  frozenDeliveryAddressText!: string | null;

  @Column('text', { name: 'frozen_access_notes', nullable: true })
  frozenAccessNotes!: string | null;

  @Column('text', { name: 'frozen_customer_name', nullable: true })
  frozenCustomerName!: string | null;

  // Superseded by `endingQuantity` and retained until the whole-draft arrival path is withdrawn:
  // the column still exists and live code still reads it (`data-model.md` §`purchase_draft_lines`).
  @Column('integer', { name: 'received_quantity', nullable: true })
  receivedQuantity!: number | null;

  // The line's own ending: what arrived at the dock, or what the customer received (AC-19). The
  // quantity, the kind, the member and the time arrive together or not at all
  // (`chk_purchase_draft_lines_ending_attribution`), and the kind must match the delivery mode
  // (AC-20).
  @Column('integer', { name: 'ending_quantity', nullable: true })
  endingQuantity!: number | null;

  @Column('varchar', { name: 'ending_kind', length: 24, nullable: true })
  endingKind!: PurchaseDraftLineEndingKind | null;

  @Column('uuid', { name: 'ending_recorded_by_user_id', nullable: true })
  endingRecordedByUserId!: string | null;

  @Column('timestamptz', { name: 'ending_recorded_at', nullable: true })
  endingRecordedAt!: Date | null;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
