import type { MigrationInterface, QueryRunner } from 'typeorm';

// The deferred contract half of `02-add-delivery-destinations.ts`.
//
// Migration 02 expands: it adds `purchase_draft_lines.ending_quantity` beside the shipped
// `received_quantity` and backfills it, leaving both columns and both not-negative checks in place.
// It cannot also contract, because a rename — or an equivalent drop — has no backward-compatible
// form: the old name vanishes the instant it runs, while live code still reads `received_quantity`
// through the whole-draft arrival path.
//
// T17 withdraws that path, so T17 is what promotes this migration into `apps/server/migrations/`.
// The class name is final; the timestamp below is a placeholder above 02's `1786700100000` that T17
// finalizes when it promotes the file, after 03's own promoted timestamp.
export class DropReceivedQuantity1786700300000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Reconcile before dropping. Across the T2 → T17 window the superseded whole-draft arrival path
    // writes `received_quantity` only, so any ending recorded in that window never reached
    // `ending_quantity`. `IS NOT NULL` on the source, not a truthiness test: a legitimately received
    // `0` has to travel across.
    await queryRunner.query(`
      UPDATE purchase_draft_lines
      SET ending_quantity = received_quantity
      WHERE ending_quantity IS NULL AND received_quantity IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      DROP CONSTRAINT chk_purchase_draft_lines_received_quantity_not_negative
    `);
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines DROP COLUMN received_quantity`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines ADD COLUMN received_quantity integer`,
    );
    await queryRunner.query(`
      UPDATE purchase_draft_lines
      SET received_quantity = ending_quantity
      WHERE ending_quantity IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      ADD CONSTRAINT chk_purchase_draft_lines_received_quantity_not_negative
      CHECK (received_quantity IS NULL OR received_quantity >= 0)
    `);
  }
}
