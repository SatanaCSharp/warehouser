import { type MigrationInterface, type QueryRunner, TableIndex } from 'typeorm';

// One index, no data change, and the only schema change this feature makes outside the Permission
// catalogue.
//
// Reason Concentration (AC-12, `sad.md` §6.5) sums one Warehouse's Rejections by Reason.
// `purchase_draft_line_rejections` carries exactly one index today —
// `uq_purchase_draft_line_rejections_line_reason`, led by `purchase_draft_line_id` — so a
// Warehouse-wide read has no access path at all and scans every Rejection of every Workspace in the
// deployment. The relation is **cumulative**: no state predicate narrows it, nothing is ever deleted
// from it, and it is read on entering a Warehouse, so that scan grows without bound while the read's
// result stays a handful of rows.
//
// `arrival-inspection`'s data model deferred this index in as many words — "Add it when a product
// surface filters by Reason; the Rejection Register that would is deferred". This is that surface,
// and `spec.md` §8's fifth question routes the decision here. Measured on a real PostgreSQL server
// at the `spec.md` §1 scale (`_audit/data-model-2026-09-21.md` § Plan checks): seq scan, 464 shared
// buffers, 1.84 ms without it; bitmap index scan, 217 buffers, 0.54 ms with it — and the without
// figure is the one that grows with the deployment.
//
// `rejection_reason_id` follows `warehouse_id` because it is the grouping key, so the index returns
// the Warehouse's rows already in Reason order. The three measured columns — `quantity`,
// `disposition`, `delivery_mode` — are deliberately not `INCLUDE`d; `data-model.md` § Indexes
// records why.
//
// Not `CREATE INDEX CONCURRENTLY`: a concurrent build cannot run inside a transaction and every
// migration in this repository runs inside one (`apps/server/migrations/README.md`). The build takes
// a brief `SHARE` lock that blocks writes to this one relation — the same call
// `1786800000000-CreateArrivalInspectionSchema` made for `uq_purchase_draft_lines_id_warehouse_mode`
// on a populated `purchase_draft_lines`. `data-model.md` § Safe evolution records the row count at
// which that call has to be revisited.
export class AddReasonConcentrationIndex1786900000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndex(
      'purchase_draft_line_rejections',
      new TableIndex({
        name: 'idx_purchase_draft_line_rejections_warehouse_reason',
        columnNames: ['warehouse_id', 'rejection_reason_id'],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'purchase_draft_line_rejections',
      'idx_purchase_draft_line_rejections_warehouse_reason',
    );
  }
}
