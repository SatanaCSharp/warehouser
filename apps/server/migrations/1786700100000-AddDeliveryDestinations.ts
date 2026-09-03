import type { MigrationInterface, QueryRunner } from 'typeorm';

// The part that separates this feature from `ordering` (`sad.md` §2 "Existing shipped tables
// change"): five relations that already carry rows gain the destination, and the whole-draft
// arrival becomes an ending recorded per line.
//
// Raw SQL throughout, following `1786600200000-AddPurchaseDraftReference.ts` — the repository's one
// precedent for altering a shipped table — because every step here is an `ALTER`, a backfill, or a
// constraint replacement, none of which TypeORM's `Table` builder expresses.
//
// Expand / backfill / contract is used wherever a column becomes non-nullable against pre-existing
// rows: `purchase_draft_lines.delivery_mode` is added nullable, backfilled to `via_warehouse` — the
// mode every existing line was ordered under (`CONTEXT.md`: Via Warehouse "is the existing
// behaviour of every Purchase Draft Line") — and only then made NOT NULL.
export class AddDeliveryDestinations1786700100000 implements MigrationInterface {
  // eslint-disable-next-line max-lines-per-function, max-statements
  async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------------------------------------------------------------------------------
    // warehouses — the Warehouse's own Delivery Address (AC-10)
    //
    // Exactly one, corrected in place, never deactivated, no Main flag. It is a different record
    // with different rules from a Customer's, so it is columns on the Warehouse rather than a row
    // in `customer_delivery_addresses` (`sad.md` §4).
    // ---------------------------------------------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE warehouses ADD COLUMN delivery_address_text text`,
    );
    await queryRunner.query(
      `ALTER TABLE warehouses ADD COLUMN delivery_access_notes text`,
    );
    await queryRunner.query(`
      ALTER TABLE warehouses ADD CONSTRAINT chk_warehouses_delivery_address_text_stored_trimmed
      CHECK (
        delivery_address_text IS NULL
        OR (delivery_address_text <> '' AND delivery_address_text = btrim(delivery_address_text))
      )
    `);
    await queryRunner.query(`
      ALTER TABLE warehouses ADD CONSTRAINT chk_warehouses_delivery_access_notes_stored_trimmed
      CHECK (
        delivery_access_notes IS NULL
        OR (delivery_access_notes <> '' AND delivery_access_notes = btrim(delivery_access_notes))
      )
    `);
    // Access notes describe how to get into a place; there is no place to get into until the
    // address itself is recorded.
    await queryRunner.query(`
      ALTER TABLE warehouses ADD CONSTRAINT chk_warehouses_delivery_notes_require_address
      CHECK (delivery_access_notes IS NULL OR delivery_address_text IS NOT NULL)
    `);

    // ---------------------------------------------------------------------------------------
    // customer_orders — the demand's Customer and Delivery Address (AC-11, AC-11a, AC-11b, AC-24)
    // ---------------------------------------------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE customer_orders ADD COLUMN customer_id uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE customer_orders ADD COLUMN customer_delivery_address_id uuid`,
    );

    // An order that names a Customer reads that Customer's name live, which is what makes AC-03b
    // true by construction — correcting the name changes every order that names it, because there
    // is no denormalized copy to rewrite. So `customer_name` is the typed-name column only, and it
    // stops being mandatory. Every row `ordering` shipped keeps its typed name untouched (AC-11a,
    // `CONTEXT.md` §Invariants).
    await queryRunner.query(
      `ALTER TABLE customer_orders ALTER COLUMN customer_name DROP NOT NULL`,
    );

    // Demand names a Customer of the Warehouse the request applies to; a Customer of another
    // Warehouse cannot be referenced at all (AC-12).
    await queryRunner.query(`
      ALTER TABLE customer_orders ADD CONSTRAINT fk_customer_orders_customer
      FOREIGN KEY (customer_id, warehouse_id)
      REFERENCES customers (id, warehouse_id)
      ON DELETE RESTRICT
    `);
    // The address is reached through the Customer, so "an order is redirected only to another
    // address of the Customer it already names" is proven by the reference rather than re-checked
    // in application code (AC-11c). The order's own Warehouse follows transitively: the address
    // belongs to the Customer, and the Customer belongs to the order's Warehouse.
    await queryRunner.query(`
      ALTER TABLE customer_orders ADD CONSTRAINT fk_customer_orders_delivery_address
      FOREIGN KEY (customer_delivery_address_id, customer_id)
      REFERENCES customer_delivery_addresses (id, customer_id)
      ON DELETE RESTRICT
    `);

    // A Customer Order names a Customer or a typed customer name, never both and never neither
    // (`sad.md` §7). An order naming a Customer always names exactly one of that Customer's
    // Delivery Addresses — the Main one unless the member stated another (AC-11,
    // `CONTEXT.md` §Invariants) — and an order recorded by typed name names none, which is the
    // absence that tells a member which kind of row they are looking at (AC-24).
    await queryRunner.query(`
      ALTER TABLE customer_orders ADD CONSTRAINT chk_customer_orders_customer_identity
      CHECK (
        (
          customer_id IS NULL
          AND customer_name IS NOT NULL
          AND customer_delivery_address_id IS NULL
        )
        OR (
          customer_id IS NOT NULL
          AND customer_name IS NULL
          AND customer_delivery_address_id IS NOT NULL
        )
      )
    `);

    // One Customer's Unfulfilled Customer Orders, earliest needed-by first — the awaiting list
    // (`sad.md` §6.6, AC-08). The predicate is carried by the index so the read's cost stays bounded
    // by what the Customer is still waiting for rather than by everything they ever ordered, which
    // is what keeps the 250 ms p95 target honest (`spec.md` §6).
    await queryRunner.query(`
      CREATE INDEX idx_customer_orders_customer_unfulfilled
      ON customer_orders (customer_id, needed_by)
      WHERE state = 'unfulfilled'
    `);

    // ---------------------------------------------------------------------------------------
    // purchase_draft_lines — Delivery Mode, destination, the frozen capture, the per-line ending
    // ---------------------------------------------------------------------------------------

    // Expand: nullable first, so the rows that predate the column can be given a value.
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines ADD COLUMN delivery_mode varchar(24)`,
    );
    // Backfill: every existing line was ordered Via Warehouse, because that is the only way goods
    // could travel before this release (`CONTEXT.md`, `sad.md` §11).
    await queryRunner.query(
      `UPDATE purchase_draft_lines SET delivery_mode = 'via_warehouse' WHERE delivery_mode IS NULL`,
    );
    // The default is the ordinary case AC-13 requires: every new line starts as Via Warehouse, so a
    // member who never opens the delivery control gets the existing behaviour.
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines ALTER COLUMN delivery_mode SET DEFAULT 'via_warehouse'`,
    );
    // Contract.
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines ALTER COLUMN delivery_mode SET NOT NULL`,
    );

    // The live destination reference, held only while the line is still editable. A Via Warehouse
    // line stores none, because its destination *is* the Warehouse's own address (`sad.md` §6.7).
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines ADD COLUMN customer_delivery_address_id uuid`,
    );

    // The Delivery Address as it read at Ready for Ordering — a write of values, not a reference,
    // so no later edit in place can travel into it (AC-16, AC-17, `spec.md` §8 second question at
    // its stated default). The customer name is captured with it, which is the Direct to Customer
    // case only (`sad.md` §6.8).
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines ADD COLUMN frozen_delivery_address_text text`,
    );
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines ADD COLUMN frozen_access_notes text`,
    );
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines ADD COLUMN frozen_customer_name text`,
    );

    // The line's own ending. `ending_quantity` supersedes `received_quantity` because the column now
    // also holds what a customer received on a Direct to Customer line, and a column named for the
    // dock holding a figure the dock never saw is exactly the misnaming a later reader trips over
    // ([ADR 0002](../adr/0002-per-line-purchase-draft-endings.md)).
    //
    // It is *added alongside* `received_quantity` and backfilled from it rather than renamed: a
    // rename has no backward-compatible form — the old name vanishes the instant it runs — and live
    // code still reads `received_quantity` until T17 withdraws the whole-draft arrival path. The
    // contract half, dropping `received_quantity` and its check, is deferred to its own migration
    // promoted with T17.
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines ADD COLUMN ending_quantity integer`,
    );
    // `IS NOT NULL`, not a truthiness test: a legitimately received `0` has to travel across.
    await queryRunner.query(`
      UPDATE purchase_draft_lines
      SET ending_quantity = received_quantity
      WHERE received_quantity IS NOT NULL
    `);
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines ADD COLUMN ending_kind varchar(24)`,
    );
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines ADD COLUMN ending_recorded_by_user_id uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines ADD COLUMN ending_recorded_at timestamptz`,
    );

    // Backfill the attribution of the endings that already happened. Every line carrying a quantity
    // was written by the whole-draft Arrival Confirmation this release supersedes, so its member and
    // its time are the draft's. A line whose draft carries no arrival attribution is left for the
    // constraint below to reject loudly rather than silently repaired.
    await queryRunner.query(`
      UPDATE purchase_draft_lines AS line
      SET ending_kind = 'arrival',
          ending_recorded_by_user_id = draft.arrival_confirmed_by_user_id,
          ending_recorded_at = draft.arrival_confirmed_at
      FROM purchase_drafts AS draft
      WHERE draft.id = line.purchase_draft_id
        AND line.ending_quantity IS NOT NULL
    `);

    // `chk_purchase_draft_lines_received_quantity_not_negative` survives, because the column it
    // guards survives until the deferred contract migration. Both checks coexist meanwhile.
    //
    // What arrived, or what the customer received, is bounded neither above nor below by what was
    // ordered — only by zero (AC-19, `CONTEXT.md` §Invariants).
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      ADD CONSTRAINT chk_purchase_draft_lines_ending_quantity_not_negative
      CHECK (ending_quantity IS NULL OR ending_quantity >= 0)
    `);

    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines ADD CONSTRAINT chk_purchase_draft_lines_delivery_mode
      CHECK (delivery_mode IN ('via_warehouse', 'direct_to_customer'))
    `);

    // A Direct to Customer line names a Customer Delivery Address and a Via Warehouse line names
    // none (`sad.md` §7, `CONTEXT.md` §Invariants). AC-14 — a direct line may never name the
    // Warehouse's own address — needs no clause here: the Warehouse's address is columns on
    // `warehouses` and has no identifier this column could hold, so the refusal is structural and
    // the command's error message is about the member's submitted intent.
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      ADD CONSTRAINT chk_purchase_draft_lines_delivery_mode_address
      CHECK (
        (delivery_mode = 'direct_to_customer' AND customer_delivery_address_id IS NOT NULL)
        OR (delivery_mode = 'via_warehouse' AND customer_delivery_address_id IS NULL)
      )
    `);

    // An ending carries its quantity, its kind, its member and its time, or none of the four
    // (AC-19, AC-20a "naming when and by whom").
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines ADD CONSTRAINT chk_purchase_draft_lines_ending_attribution
      CHECK (
        (
          ending_quantity IS NOT NULL
          AND ending_kind IS NOT NULL
          AND ending_recorded_by_user_id IS NOT NULL
          AND ending_recorded_at IS NOT NULL
        )
        OR (
          ending_quantity IS NULL
          AND ending_kind IS NULL
          AND ending_recorded_by_user_id IS NULL
          AND ending_recorded_at IS NULL
        )
      )
    `);

    // A line's ending matches the way its goods travelled: an Arrival Confirmation for a Via
    // Warehouse line, a Direct Delivery for a Direct to Customer one. Recording either against the
    // other mode is refused (AC-20) — as a schema fact, not only as a command's memory.
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines ADD CONSTRAINT chk_purchase_draft_lines_ending_matches_mode
      CHECK (
        ending_kind IS NULL
        OR (ending_kind = 'arrival' AND delivery_mode = 'via_warehouse')
        OR (ending_kind = 'direct_delivery' AND delivery_mode = 'direct_to_customer')
      )
    `);

    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      ADD CONSTRAINT chk_purchase_draft_lines_frozen_delivery_stored_trimmed
      CHECK (
        (
          frozen_delivery_address_text IS NULL
          OR (
            frozen_delivery_address_text <> ''
            AND frozen_delivery_address_text = btrim(frozen_delivery_address_text)
          )
        )
        AND (
          frozen_access_notes IS NULL
          OR (frozen_access_notes <> '' AND frozen_access_notes = btrim(frozen_access_notes))
        )
        AND (
          frozen_customer_name IS NULL
          OR (frozen_customer_name <> '' AND frozen_customer_name = btrim(frozen_customer_name))
        )
      )
    `);

    // The frozen capture is one statement made at one moment: the access notes and the customer
    // name are part of the address that was read out, so neither can stand without it. The customer
    // name is captured only where there is one, which is the Direct to Customer case
    // (`sad.md` §6.8 step 5).
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines ADD CONSTRAINT chk_purchase_draft_lines_frozen_capture_shape
      CHECK (
        (frozen_access_notes IS NULL OR frozen_delivery_address_text IS NOT NULL)
        AND (
          frozen_customer_name IS NULL
          OR (
            frozen_delivery_address_text IS NOT NULL
            AND delivery_mode = 'direct_to_customer'
          )
        )
      )
    `);

    // A Direct to Customer line ships to an address of a Customer of its own Warehouse (AC-12,
    // quality goal 2). One reference proves address, Customer and Warehouse together.
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines ADD CONSTRAINT fk_purchase_draft_lines_delivery_address
      FOREIGN KEY (customer_delivery_address_id, warehouse_id)
      REFERENCES customer_delivery_addresses (id, warehouse_id)
      ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines ADD CONSTRAINT fk_purchase_draft_lines_ending_recorded_by_user
      FOREIGN KEY (ending_recorded_by_user_id)
      REFERENCES users (id)
      ON DELETE RESTRICT
    `);

    // ---------------------------------------------------------------------------------------
    // purchase_draft_demand_snapshots — the Delivery Address each linked Customer Order was going
    // to at the freeze (AC-16), without which Address Drift has nothing to compare against
    // ---------------------------------------------------------------------------------------

    // The comparison key: which address the order named at the freeze. Address Drift is an identity
    // comparison against the address the order names now (AC-18, AC-18a), so correcting a typo in
    // an address's text is not a redirection and does not report drift.
    await queryRunner.query(`
      ALTER TABLE purchase_draft_demand_snapshots
      ADD COLUMN captured_customer_delivery_address_id uuid
    `);
    // The statement: the address text as it read at that instant, which is what AC-18 shows the
    // member beside the address the demand now expects.
    await queryRunner.query(`
      ALTER TABLE purchase_draft_demand_snapshots
      ADD COLUMN captured_delivery_address_text text
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_demand_snapshots
      ADD CONSTRAINT fk_purchase_draft_demand_snapshots_captured_address
      FOREIGN KEY (captured_customer_delivery_address_id)
      REFERENCES customer_delivery_addresses (id)
      ON DELETE RESTRICT
    `);
    // The key and the statement are captured together or not at all. Not at all is the legitimate
    // case of a link to a Customer Order recorded by typed name, which names no address — those
    // orders are linkable to a Via Warehouse line exactly as before (AC-11a, AC-15b).
    await queryRunner.query(`
      ALTER TABLE purchase_draft_demand_snapshots
      ADD CONSTRAINT chk_purchase_draft_demand_snapshots_captured_address_pairing
      CHECK (
        (
          captured_customer_delivery_address_id IS NULL
          AND captured_delivery_address_text IS NULL
        )
        OR (
          captured_customer_delivery_address_id IS NOT NULL
          AND captured_delivery_address_text IS NOT NULL
          AND captured_delivery_address_text <> ''
          AND captured_delivery_address_text = btrim(captured_delivery_address_text)
        )
      )
    `);

    // ---------------------------------------------------------------------------------------
    // purchase_drafts — a third way to reach Closed
    // ---------------------------------------------------------------------------------------

    // `ordering` admitted exactly two closure paths and required one of them. This release adds a
    // third — the draft closes when the last of its lines has an ending (AC-19) — which writes
    // neither the arrival attribution nor a reason, so "exactly one of the two" becomes "never
    // both". The arrival columns are retained, unwritten by any new path, as the record of the
    // drafts closed by the whole-draft Arrival Confirmation before this release (`sad.md` §7).
    //
    // "A Closed draft has an ending on every line" is cross-row and therefore not a row constraint;
    // it is the conditional update of `sad.md` §6.10 — see `data-model.md` §"Constraints the model
    // deliberately does not express".
    await queryRunner.query(
      `ALTER TABLE purchase_drafts DROP CONSTRAINT chk_purchase_drafts_closure_path`,
    );
    await queryRunner.query(`
      ALTER TABLE purchase_drafts ADD CONSTRAINT chk_purchase_drafts_closure_path
      CHECK (
        (arrival_confirmed_at IS NULL) = (arrival_confirmed_by_user_id IS NULL)
        AND (arrival_confirmed_at IS NULL OR closure_reason IS NULL)
      )
    `);
  }

  // eslint-disable-next-line max-statements
  async down(queryRunner: QueryRunner): Promise<void> {
    // The revert restores a constraint that admits only two closure paths, and this release added a
    // third: a draft closed because the last of its lines had an ending carries neither a reason nor
    // a whole-draft arrival attribution, and would be rejected by the restored check — a revert that
    // fails part-way through rather than one that runs. Verified: without the two repairs below the
    // revert aborts with `check constraint "chk_purchase_drafts_closure_path" ... is violated by
    // some row` (`_audit/data-model-2026-09-02.md` § Destructive-change sequencing).
    //
    // First repair, and the faithful one: a draft closed by its last line's ending is, in the older
    // vocabulary, a draft whose goods were accounted for — so it takes the whole-draft Arrival
    // Confirmation attribution back from the last ending recorded on it. `closed_at` is that same
    // instant, because the closure happens in the ending's own transaction (`sad.md` §6.10), which
    // is also what `chk_purchase_drafts_transition_order` requires of the pair.
    //
    // This runs before the line ending columns are dropped, because it reads them.
    await queryRunner.query(`
      UPDATE purchase_drafts AS draft
      SET arrival_confirmed_by_user_id = last_ending.recorded_by_user_id,
          arrival_confirmed_at = draft.closed_at
      FROM (
        SELECT purchase_draft_id,
               (
                 array_agg(ending_recorded_by_user_id ORDER BY ending_recorded_at DESC, id DESC)
               )[1] AS recorded_by_user_id
        FROM purchase_draft_lines
        WHERE ending_recorded_at IS NOT NULL
        GROUP BY purchase_draft_id
      ) AS last_ending
      WHERE last_ending.purchase_draft_id = draft.id
        AND draft.state = 'closed'
        AND draft.closure_reason IS NULL
        AND draft.arrival_confirmed_at IS NULL
    `);

    // Second repair, the fallback: a Closed draft the first repair could not reach — one holding no
    // line with an ending at all — is given a reason, because the older model insists a Closed draft
    // was closed by one of its two paths and this is the only one left. It states what happened
    // rather than inventing an arrival.
    await queryRunner.query(`
      UPDATE purchase_drafts
      SET closure_reason = 'Closed by per-line endings, which are no longer recorded after this release was reverted.'
      WHERE state = 'closed'
        AND closure_reason IS NULL
        AND arrival_confirmed_at IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE purchase_drafts DROP CONSTRAINT chk_purchase_drafts_closure_path`,
    );
    await queryRunner.query(`
      ALTER TABLE purchase_drafts ADD CONSTRAINT chk_purchase_drafts_closure_path
      CHECK (
        state <> 'closed'
        OR (
          arrival_confirmed_at IS NOT NULL
          AND arrival_confirmed_by_user_id IS NOT NULL
          AND closure_reason IS NULL
        )
        OR (
          arrival_confirmed_at IS NULL
          AND arrival_confirmed_by_user_id IS NULL
          AND closure_reason IS NOT NULL
        )
      )
    `);

    await queryRunner.query(`
      ALTER TABLE purchase_draft_demand_snapshots
      DROP CONSTRAINT chk_purchase_draft_demand_snapshots_captured_address_pairing
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_demand_snapshots
      DROP CONSTRAINT fk_purchase_draft_demand_snapshots_captured_address
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_demand_snapshots DROP COLUMN captured_delivery_address_text
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_demand_snapshots
      DROP COLUMN captured_customer_delivery_address_id
    `);

    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines DROP CONSTRAINT fk_purchase_draft_lines_ending_recorded_by_user
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines DROP CONSTRAINT fk_purchase_draft_lines_delivery_address
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines DROP CONSTRAINT chk_purchase_draft_lines_frozen_capture_shape
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      DROP CONSTRAINT chk_purchase_draft_lines_frozen_delivery_stored_trimmed
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines DROP CONSTRAINT chk_purchase_draft_lines_ending_matches_mode
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines DROP CONSTRAINT chk_purchase_draft_lines_ending_attribution
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines DROP CONSTRAINT chk_purchase_draft_lines_delivery_mode_address
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines DROP CONSTRAINT chk_purchase_draft_lines_delivery_mode
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_draft_lines
      DROP CONSTRAINT chk_purchase_draft_lines_ending_quantity_not_negative
    `);
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines DROP COLUMN ending_recorded_at`,
    );
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines DROP COLUMN ending_recorded_by_user_id`,
    );
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines DROP COLUMN ending_kind`,
    );
    // `received_quantity` and its check were never touched by `up`, so the revert only removes the
    // column this migration added.
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines DROP COLUMN ending_quantity`,
    );
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines DROP COLUMN frozen_customer_name`,
    );
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines DROP COLUMN frozen_access_notes`,
    );
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines DROP COLUMN frozen_delivery_address_text`,
    );
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines DROP COLUMN customer_delivery_address_id`,
    );
    await queryRunner.query(
      `ALTER TABLE purchase_draft_lines DROP COLUMN delivery_mode`,
    );

    await queryRunner.query(
      `DROP INDEX idx_customer_orders_customer_unfulfilled`,
    );
    await queryRunner.query(
      `ALTER TABLE customer_orders DROP CONSTRAINT chk_customer_orders_customer_identity`,
    );
    await queryRunner.query(
      `ALTER TABLE customer_orders DROP CONSTRAINT fk_customer_orders_delivery_address`,
    );
    await queryRunner.query(
      `ALTER TABLE customer_orders DROP CONSTRAINT fk_customer_orders_customer`,
    );
    // Restoring NOT NULL means every order has to carry a typed name again, so an order recorded
    // against a Customer is given that Customer's name as it reads at the moment of the revert.
    // The schema reverses completely; the domain distinction does not — after this, an order that
    // named a Customer is indistinguishable from one typed by hand. That is the price of reverting
    // past this release and it is stated in `data-model.md` §Migrations rather than discovered.
    await queryRunner.query(`
      UPDATE customer_orders AS o
      SET customer_name = c.name
      FROM customers AS c
      WHERE c.id = o.customer_id AND o.customer_name IS NULL
    `);
    await queryRunner.query(
      `ALTER TABLE customer_orders DROP COLUMN customer_delivery_address_id`,
    );
    await queryRunner.query(
      `ALTER TABLE customer_orders DROP COLUMN customer_id`,
    );
    await queryRunner.query(
      `ALTER TABLE customer_orders ALTER COLUMN customer_name SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE warehouses DROP CONSTRAINT chk_warehouses_delivery_notes_require_address`,
    );
    await queryRunner.query(`
      ALTER TABLE warehouses DROP CONSTRAINT chk_warehouses_delivery_access_notes_stored_trimmed
    `);
    await queryRunner.query(`
      ALTER TABLE warehouses DROP CONSTRAINT chk_warehouses_delivery_address_text_stored_trimmed
    `);
    await queryRunner.query(
      `ALTER TABLE warehouses DROP COLUMN delivery_access_notes`,
    );
    await queryRunner.query(
      `ALTER TABLE warehouses DROP COLUMN delivery_address_text`,
    );
  }
}
