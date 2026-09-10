import {
  type MigrationInterface,
  type QueryRunner,
  Table,
  TableCheck,
  TableForeignKey,
  TableUnique,
} from 'typeorm';

// `CONTEXT.md` §Glossary "Rejection Reason": the catalogue is system-managed, extended only through
// application migrations, and **never reworded or retired** — which is what makes AC-23a hold
// structurally rather than by a snapshot column. `sad.md` §4 records the one rule that distinguishes
// it from the Packaging Type catalogue it otherwise copies.
//
// `requires_description` is catalogue data rather than a hard-coded identifier (`sad.md` §4, §11):
// AC-07 names only "unfit — other" today, and keeping the rule on the row is what stops the next
// prose-requiring Reason from being a code change.
export const initialRejectionReasons = [
  ['damaged_in_transit', 'Damaged in transit', false],
  ['damaged_by_packing', 'Damaged by packing', false],
  ['quality_defect', 'Quality defect', false],
  ['wrong_item_supplied', 'Wrong item supplied', false],
  ['short_within_packaging', 'Short within packaging', false],
  ['packaging_not_as_instructed', 'Packaging not as instructed', false],
  ['value_adding_note_not_applied', 'Value-adding note not applied', false],
  ['shelf_life_insufficient', 'Shelf life insufficient', false],
  ['documentation_missing', 'Documentation missing', false],
  ['unfit_other', 'Unfit — other', true],
] as const;

export class CreateArrivalInspectionSchema1786800000000 implements MigrationInterface {
  // One atomic schema operation for the two relations of `sad.md` §7 plus the two Pre-receipt
  // Conformance columns on the shipped `purchase_draft_lines`.
  //
  // `purchase_draft_lines` already carries rows, so the order below matters: the shipped relation is
  // widened first (two nullable columns, no backfill — `spec.md` §8 tenth question at its stated
  // default leaves every pre-release ending untouched), then the catalogue is created and seeded,
  // and only then the Rejection relation whose composite reference target the widening created.

  // eslint-disable-next-line max-lines-per-function
  async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------------------------------------------------------------------------------
    // purchase_draft_lines — the Pre-receipt Conformance, and the composite reference target a
    // Rejection needs to prove its Warehouse and its Delivery Mode through one reference
    // ---------------------------------------------------------------------------------------

    // NULL until an ending records it, and NULL forever on a line where nothing was received
    // (AC-04a) and on every ending recorded before this release (`sad.md` §7). Both columns are
    // added nullable against populated rows, so nothing backfills and nothing can fail.
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines ADD COLUMN pre_receipt_conformance varchar(24)`,
    );
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines ADD COLUMN pre_receipt_conformance_note text`,
    );

    // `chk_purchase_draft_lines_pre_receipt_conformance` — the three verdicts the column admits.
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      ADD CONSTRAINT chk_purchase_draft_lines_pre_receipt_conformance
      CHECK (
        pre_receipt_conformance IS NULL
        OR pre_receipt_conformance IN ('met', 'not_met', 'not_applicable')
      )
    `);

    // AC-17/AC-17a as a schema fact rather than a command's memory: both halves of the frozen
    // instruction live on this same row, so the rule is decidable without reading anything else.
    // A line frozen carrying a Packaging Type, a Value-adding Note, or both is judged Met or Not
    // met; Not applicable belongs only to a line that was given neither.
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      ADD CONSTRAINT chk_purchase_draft_lines_pre_receipt_conformance_instruction
      CHECK (
        pre_receipt_conformance IS NULL
        OR (
          CASE
            WHEN packaging_type_id IS NULL AND value_adding_note IS NULL
              THEN pre_receipt_conformance = 'not_applicable'
            ELSE pre_receipt_conformance IN ('met', 'not_met')
          END
        )
      )
    `);

    // AC-04a — a judgement exists only where an ending recorded something. The converse ("every
    // received ending carries a judgement") is deliberately **not** a constraint: every ending
    // recorded before this release carries none and must stay legal (`spec.md` §8, tenth question).
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      ADD CONSTRAINT chk_purchase_draft_lines_conformance_requires_ending
      CHECK (
        pre_receipt_conformance IS NULL
        OR (ending_recorded_at IS NOT NULL AND ending_quantity > 0)
      )
    `);

    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      ADD CONSTRAINT chk_purchase_draft_lines_conformance_note_shape
      CHECK (
        pre_receipt_conformance_note IS NULL
        OR (
          pre_receipt_conformance IS NOT NULL
          AND pre_receipt_conformance_note <> ''
          AND pre_receipt_conformance_note = btrim(pre_receipt_conformance_note)
        )
      )
    `);

    // AC-15b — the one thousand characters `spec.md` §5 bounds the member's note by, in characters
    // rather than bytes so the bound reads the same in Ukrainian as in English.
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      ADD CONSTRAINT chk_purchase_draft_lines_conformance_note_length
      CHECK (
        pre_receipt_conformance_note IS NULL
        OR char_length(pre_receipt_conformance_note) <= 1000
      )
    `);

    // The composite reference target a Rejection points at. One reference then proves three things
    // at once — the line exists, it belongs to the acting Warehouse (AC-26), and its Delivery Mode
    // is the one the Rejection's Source claims (AC-25) — exactly as
    // `uq_purchase_draft_lines_id_draft_warehouse` does for a link. `id` leads, so the constraint
    // can never fail on the populated table: it is unique by the primary key alone.
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      ADD CONSTRAINT uq_purchase_draft_lines_id_warehouse_mode
      UNIQUE (id, warehouse_id, delivery_mode)
    `);

    // ---------------------------------------------------------------------------------------
    // rejection_reasons — the extend-only catalogue (AC-06, AC-23a)
    // ---------------------------------------------------------------------------------------

    await queryRunner.createTable(
      new Table({
        name: 'rejection_reasons',
        columns: [
          // The identifier a Rejection stores. A Rejection **names** its Reason rather than copying
          // the wording, which is what makes extending the catalogue change no recorded Rejection
          // (AC-23a) — the opposite of `packaging_types`, which is frozen by value onto a line
          // precisely because it *can* be reworded.
          { name: 'id', type: 'varchar', length: '32', isPrimary: true },
          { name: 'label', type: 'varchar', length: '100' },
          // AC-07 expressed as data. `unfit_other` is the only seeded Reason that carries it.
          { name: 'requires_description', type: 'boolean', default: false },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        checks: [
          new TableCheck({
            name: 'chk_rejection_reasons_label_stored_trimmed',
            expression: `label <> '' AND label = btrim(label)`,
          }),
        ],
      }),
    );

    await queryRunner.manager.insert(
      'rejection_reasons',
      initialRejectionReasons.map(([id, label, requiresDescription]) => ({
        id,
        label,
        requires_description: requiresDescription,
      })),
    );

    // ---------------------------------------------------------------------------------------
    // purchase_draft_line_rejections — the Condition Split's refused half (AC-01, AC-05, AC-08)
    // ---------------------------------------------------------------------------------------

    await queryRunner.createTable(
      new Table({
        name: 'purchase_draft_line_rejections',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'purchase_draft_line_id', type: 'uuid' },
          // Carried so the amendment of §6.4 resolves one Rejection in the acting Warehouse without
          // joining its line, and so the composite reference below can prove ownership. Kept honest
          // by `fk_purchase_draft_line_rejections_line`, exactly as
          // `purchase_draft_line_links.purchase_draft_id` is.
          { name: 'warehouse_id', type: 'uuid' },
          // Carried for the same reason and to the same standard: it is the line's Delivery Mode,
          // proven by the same reference, and it is what lets AC-25 be a check on this row rather
          // than a rule the command has to remember.
          { name: 'delivery_mode', type: 'varchar', length: '24' },
          { name: 'rejection_reason_id', type: 'varchar', length: '32' },
          { name: 'quantity', type: 'integer' },
          { name: 'source', type: 'varchar', length: '24' },
          // The member's prose about the goods (AC-13). Required by a Reason the catalogue marks
          // `requires_description` (AC-07) — a cross-table rule the command asserts, because a CHECK
          // cannot read another relation.
          { name: 'description', type: 'text', isNullable: true },
          // What the Warehouse decided became of the refused goods. Starts Undecided and is never
          // returned to it once decided (AC-18a) — a transition rule, so the column's own check
          // bounds only the vocabulary (AC-19).
          {
            name: 'disposition',
            type: 'varchar',
            length: '24',
            default: `'undecided'`,
          },
          // The raising member and the time they raised it. `created_at` **is** that time, following
          // `arrival_allocations.allocated_by_user_id`/`created_at` and
          // `item_stock_adjustments.adjusted_by_user_id`/`created_at`; both are NOT NULL, so the
          // pair needs no attribution check of its own.
          { name: 'raised_by_user_id', type: 'uuid' },
          // The amending member and the time, which arrive together or not at all
          // (`chk_purchase_draft_line_rejections_amendment_attribution`, AC-18, AC-18b).
          { name: 'amended_by_user_id', type: 'uuid', isNullable: true },
          { name: 'amended_at', type: 'timestamptz', isNullable: true },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        uniques: [
          // AC-09 — one line carries one Rejection per Reason, so the quantities for a Reason belong
          // together. This is also the access path §6.3 reads a line's Rejections by, its leading
          // column being the line.
          new TableUnique({
            name: 'uq_purchase_draft_line_rejections_line_reason',
            columnNames: ['purchase_draft_line_id', 'rejection_reason_id'],
          }),
        ],
        foreignKeys: [
          // One reference proves line, Warehouse and Delivery Mode together (AC-25, AC-26).
          new TableForeignKey({
            name: 'fk_purchase_draft_line_rejections_line',
            columnNames: [
              'purchase_draft_line_id',
              'warehouse_id',
              'delivery_mode',
            ],
            referencedTableName: 'purchase_draft_lines',
            referencedColumnNames: ['id', 'warehouse_id', 'delivery_mode'],
            onDelete: 'RESTRICT',
          }),
          // AC-06 as referential integrity: a Reason outside the catalogue cannot be stored, and a
          // catalogue row a Rejection names cannot be deleted — the second half of the extend-only
          // rule that a migration convention alone would leave to review.
          new TableForeignKey({
            name: 'fk_purchase_draft_line_rejections_reason',
            columnNames: ['rejection_reason_id'],
            referencedTableName: 'rejection_reasons',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'fk_purchase_draft_line_rejections_raised_by_user',
            columnNames: ['raised_by_user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'fk_purchase_draft_line_rejections_amended_by_user',
            columnNames: ['amended_by_user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          // AC-03 — a refused quantity is a whole number of at least one. The column's integer type
          // carries the whole-number half; this carries the rest.
          new TableCheck({
            name: 'chk_purchase_draft_line_rejections_quantity_positive',
            expression: 'quantity > 0',
          }),
          new TableCheck({
            name: 'chk_purchase_draft_line_rejections_source',
            expression: `source IN ('inspected', 'customer_reported')`,
          }),
          // AC-25, and its mirror in §6.2 — a refusal on goods that came to our own dock was
          // Inspected, and only directly delivered goods carry a customer's report. The shape is
          // `chk_purchase_draft_lines_ending_matches_mode`'s, one relation further out.
          new TableCheck({
            name: 'chk_purchase_draft_line_rejections_source_matches_mode',
            expression: `
              (source = 'inspected' AND delivery_mode = 'via_warehouse')
              OR (source = 'customer_reported' AND delivery_mode = 'direct_to_customer')
            `,
          }),
          // AC-19 — the vocabulary only. "Never back to Undecided" is a transition and lives in the
          // conditional update of §6.4.
          new TableCheck({
            name: 'chk_purchase_draft_line_rejections_disposition',
            expression: `
              disposition IN (
                'undecided', 'refused_at_delivery', 'held_for_return', 'scrapped_on_site'
              )
            `,
          }),
          new TableCheck({
            name: 'chk_purchase_draft_line_rejections_description_stored_trimmed',
            expression: `
              description IS NULL
              OR (description <> '' AND description = btrim(description))
            `,
          }),
          // AC-14 — one thousand characters, in characters rather than bytes.
          new TableCheck({
            name: 'chk_purchase_draft_line_rejections_description_length',
            expression:
              'description IS NULL OR char_length(description) <= 1000',
          }),
          // AC-18/AC-18b — an amendment records the acting member and the time together or records
          // neither, the shape `chk_purchase_draft_lines_ending_attribution` established.
          new TableCheck({
            name: 'chk_purchase_draft_line_rejections_amendment_attribution',
            expression: `
              (amended_by_user_id IS NOT NULL AND amended_at IS NOT NULL)
              OR (amended_by_user_id IS NULL AND amended_at IS NULL)
            `,
          }),
        ],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // The Rejection relation first: it references both `rejection_reasons` and the composite unique
    // on `purchase_draft_lines`, each with ON DELETE RESTRICT.
    await queryRunner.dropTable('purchase_draft_line_rejections');
    await queryRunner.dropTable('rejection_reasons');

    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      DROP CONSTRAINT uq_purchase_draft_lines_id_warehouse_mode
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      DROP CONSTRAINT chk_purchase_draft_lines_conformance_note_length
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      DROP CONSTRAINT chk_purchase_draft_lines_conformance_note_shape
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      DROP CONSTRAINT chk_purchase_draft_lines_conformance_requires_ending
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      DROP CONSTRAINT chk_purchase_draft_lines_pre_receipt_conformance_instruction
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      DROP CONSTRAINT chk_purchase_draft_lines_pre_receipt_conformance
    `);

    // No repair runs on the way back. Every judgement this release recorded is discarded with its
    // columns, and every ending recorded before it was never touched — which is what makes this
    // revert cost exactly the two columns and nothing else (`data-model.md` § What a revert costs).
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines DROP COLUMN pre_receipt_conformance_note`,
    );
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines DROP COLUMN pre_receipt_conformance`,
    );
  }
}
