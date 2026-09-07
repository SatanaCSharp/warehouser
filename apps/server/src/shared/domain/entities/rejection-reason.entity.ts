import { Column, Entity, PrimaryColumn } from 'typeorm';

// The extend-only Rejection Reason catalogue (AC-06, AC-23a) — the `packaging_types` shape plus the
// one flag AC-07 keeps as catalogue data rather than a hard-coded identifier
// (`data-model.md` §`rejection_reasons`). A Rejection **names** a row here rather than copying its
// wording, so extending the catalogue changes no recorded Rejection.
@Entity({ name: 'rejection_reasons' })
export class RejectionReasonEntity {
  @PrimaryColumn('varchar', { length: 32 })
  id!: string;

  @Column('varchar', { length: 100 })
  label!: string;

  // AC-07 as data: a Reason marked here requires the member's description (AC-13). Seeded true on
  // `unfit_other` alone.
  @Column('boolean', { name: 'requires_description' })
  requiresDescription!: boolean;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
