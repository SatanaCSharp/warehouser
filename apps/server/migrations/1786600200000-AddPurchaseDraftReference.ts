import type { MigrationInterface, QueryRunner } from 'typeorm';

// The approved design frames name every draft by a human reference — `PD-0143` on the list card, in
// the detail header and in each dialog title (`docs/features/ordering/previews/yGhkK.png`,
// `s5EPi.png`). `spec.md` fixes no format for it, so the shape is chosen here: the `PD-` prefix and
// four zero-padded digits the frames show.
//
// The value is minted by a column DEFAULT over a sequence rather than by the application, so the
// database is the single writer: no insert path can mint one, skip one, or collide, and
// `purchase-draft.entity.ts` marks the column `insert: false` to keep it that way.
//
// The sequence is global across Warehouses — `PD-0143` and `PD-0144` may belong to different
// Warehouses, and a Warehouse's own references have gaps. A per-Warehouse counter would need a
// serialized read of the Warehouse's last reference on every insert; the frames show only that a
// draft has a reference, not that it counts from 1 within a Warehouse, so the global sequence is
// the deliberate simplification.
export class AddPurchaseDraftReference1786600200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE SEQUENCE purchase_draft_reference_seq AS bigint START WITH 1 INCREMENT BY 1`,
    );

    // Added nullable first: the column has to exist before the rows that predate it can be given a
    // value, and only then can NOT NULL and the uniqueness constraint be asserted.
    await queryRunner.query(
      `ALTER TABLE purchase_drafts ADD COLUMN reference text`,
    );

    // Backfill in creation order, so drafts that already exist read in the order they were made
    // rather than in whatever order the update happens to visit them. `row_number()` — not
    // `nextval()` — because a set-returning update calls `nextval()` in an unspecified row order.
    await queryRunner.query(
      `
      UPDATE purchase_drafts AS draft
      SET reference = 'PD-' || lpad(ordered.position::text, 4, '0')
      FROM (
        SELECT id, row_number() OVER (ORDER BY created_at, id) AS position
        FROM purchase_drafts
      ) AS ordered
      WHERE draft.id = ordered.id
      `,
    );

    // `is_called = false` makes the next `nextval()` return exactly this number, so an empty table
    // starts at `PD-0001` and a backfilled one continues after the last row it just numbered.
    await queryRunner.query(
      `SELECT setval('purchase_draft_reference_seq', (SELECT count(*) FROM purchase_drafts) + 1, false)`,
    );

    await queryRunner.query(
      `ALTER TABLE purchase_drafts ALTER COLUMN reference SET DEFAULT ('PD-' || lpad(nextval('purchase_draft_reference_seq')::text, 4, '0'))`,
    );
    await queryRunner.query(
      `ALTER TABLE purchase_drafts ALTER COLUMN reference SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE purchase_drafts ADD CONSTRAINT uq_purchase_drafts_reference UNIQUE (reference)`,
    );
    await queryRunner.query(
      `ALTER TABLE purchase_drafts ADD CONSTRAINT chk_purchase_drafts_reference_stored_trimmed CHECK (reference <> '' AND reference = btrim(reference))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // The column goes first: it carries the DEFAULT that depends on the sequence, and the sequence
    // is deliberately not `OWNED BY` the column, so both are dropped explicitly.
    await queryRunner.query(
      `ALTER TABLE purchase_drafts DROP COLUMN reference`,
    );
    await queryRunner.query(`DROP SEQUENCE purchase_draft_reference_seq`);
  }
}
