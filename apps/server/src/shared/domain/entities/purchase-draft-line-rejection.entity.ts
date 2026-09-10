import { type PurchaseDraftLineDeliveryMode } from 'shared/domain/entities/purchase-draft-line.entity';
import { Column, Entity, PrimaryColumn } from 'typeorm';

// `chk_purchase_draft_line_rejections_source` — where the refusal came from. A refusal on goods that
// reached our own dock was Inspected; only directly delivered goods carry a customer's report
// (AC-24, AC-25). Declared beside the column because it is a persistence-oriented value, exactly as
// `PurchaseDraftLineDeliveryMode` and `CustomerOrderState` are: both `shared/domain/repositories/`
// and the `purchase-drafts` module read it without either depending on the other
// (server-architecture.md §Dependency direction).
export type PurchaseDraftLineRejectionSource =
  'inspected' | 'customer_reported';

// `chk_purchase_draft_line_rejections_disposition` — what the Warehouse decided became of the
// refused goods (AC-19). The vocabulary only; "never back to Undecided" is a transition rule and
// lives in the conditional update of `sad.md` §6.4.
export type PurchaseDraftLineRejectionDisposition =
  'undecided' | 'refused_at_delivery' | 'held_for_return' | 'scrapped_on_site';

@Entity({ name: 'purchase_draft_line_rejections' })
export class PurchaseDraftLineRejectionEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'purchase_draft_line_id' })
  purchaseDraftLineId!: string;

  // Carried so §6.4 resolves one Rejection in the acting Warehouse without joining its line, and so
  // `fk_purchase_draft_line_rejections_line` can prove ownership through one reference (AC-26) —
  // exactly as `purchase_draft_line_links.warehouse_id` is. `purchase_draft_id` is deliberately not
  // carried (`data-model.md` §`purchase_draft_line_rejections`).
  @Column('uuid', { name: 'warehouse_id' })
  warehouseId!: string;

  // The line's own Delivery Mode, proven by that same reference, which is what lets AC-25 be a check
  // on this row rather than a rule the command has to remember.
  @Column('varchar', { name: 'delivery_mode', length: 24 })
  deliveryMode!: PurchaseDraftLineDeliveryMode;

  @Column('varchar', { name: 'rejection_reason_id', length: 32 })
  rejectionReasonId!: string;

  @Column('integer')
  quantity!: number;

  @Column('varchar', { length: 24 })
  source!: PurchaseDraftLineRejectionSource;

  // The member's prose about the goods (AC-13), required by a Reason the catalogue marks
  // `requires_description` — a cross-table rule the command asserts, because a CHECK cannot read
  // another relation.
  @Column('text', { nullable: true })
  description!: string | null;

  @Column('varchar', { length: 24 })
  disposition!: PurchaseDraftLineRejectionDisposition;

  // The raising member; `created_at` **is** the time they raised it, following
  // `arrival_allocations.allocated_by_user_id`/`created_at`.
  @Column('uuid', { name: 'raised_by_user_id' })
  raisedByUserId!: string;

  // The amending member and the time, which arrive together or not at all
  // (`chk_purchase_draft_line_rejections_amendment_attribution`, AC-18, AC-18b). `amended_at` is not
  // `updated_at` and both are kept.
  @Column('uuid', { name: 'amended_by_user_id', nullable: true })
  amendedByUserId!: string | null;

  @Column('timestamptz', { name: 'amended_at', nullable: true })
  amendedAt!: Date | null;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
