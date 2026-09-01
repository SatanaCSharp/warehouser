import {
  type MigrationInterface,
  type QueryRunner,
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

// `CONTEXT.md` §Invariants: the Packaging Type catalogue is system-managed and extended only
// through application migrations. `spec.md` AC-13 fixes the four entries this release offers.
export const initialPackagingTypes = [
  ['loose_items', 'Loose items'],
  ['cartons', 'Cartons'],
  ['pallets', 'Pallets'],
  ['cable_coil', 'Cable coil'],
] as const;

export class CreateOrderingSchema1786600000000 implements MigrationInterface {
  // One atomic schema operation for the nine relations of sad.md §7 plus the Packaging Type seed.
  // Every relation is new, so nothing here backfills, rewrites or drops shipped data.

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'items',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'warehouse_id', type: 'uuid' },
          { name: 'sku', type: 'text', collation: 'C' },
          { name: 'description', type: 'text' },
          { name: 'unit_of_measure', type: 'varchar', length: '32' },
          // A new Item starts with nothing on hand (AC-06) and the figure moves only through an
          // adjustment that states its reason (AC-08, AC-18a).
          { name: 'on_hand_quantity', type: 'integer', default: 0 },
          // Activation is recorded as the instant it happened, mirroring `warehouses.archived_at`.
          // Reactivation clears it; the SKU stays taken either way (AC-06d).
          { name: 'deactivated_at', type: 'timestamptz', isNullable: true },
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
          // A SKU identifies at most one Item within a Warehouse, and never across Warehouses
          // (AC-07, AC-07a). Deactivation does not release it (AC-06d).
          new TableUnique({
            name: 'uq_items_warehouse_sku',
            columnNames: ['warehouse_id', 'sku'],
          }),
          // Composite reference target: proves every Customer Order and Purchase Draft Line names
          // an Item of its own Warehouse (AC-03, AC-11).
          new TableUnique({
            name: 'uq_items_id_warehouse',
            columnNames: ['id', 'warehouse_id'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'fk_items_warehouse_id',
            columnNames: ['warehouse_id'],
            referencedTableName: 'warehouses',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'chk_items_sku_stored_trimmed',
            expression: "sku <> '' AND sku = btrim(sku)",
          }),
          new TableCheck({
            name: 'chk_items_description_stored_trimmed',
            expression:
              "description <> '' AND description = btrim(description)",
          }),
          new TableCheck({
            name: 'chk_items_unit_of_measure_stored_trimmed',
            expression:
              "unit_of_measure <> '' AND unit_of_measure = btrim(unit_of_measure)",
          }),
          // On-hand Quantity is a whole number that is never negative (AC-09).
          new TableCheck({
            name: 'chk_items_on_hand_quantity_not_negative',
            expression: 'on_hand_quantity >= 0',
          }),
          new TableCheck({
            name: 'chk_items_deactivation_order',
            expression:
              'deactivated_at IS NULL OR deactivated_at >= created_at',
          }),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'item_stock_adjustments',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'item_id', type: 'uuid' },
          { name: 'warehouse_id', type: 'uuid' },
          { name: 'counted_quantity', type: 'integer' },
          { name: 'reason', type: 'text' },
          { name: 'adjusted_by_user_id', type: 'uuid' },
          // Append-only: the row is written once and never updated, so it carries no `updated_at`
          // (the same shape `sessions` already uses).
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          // Proves the adjustment names an Item of its own Warehouse.
          new TableForeignKey({
            name: 'fk_item_stock_adjustments_item',
            columnNames: ['item_id', 'warehouse_id'],
            referencedTableName: 'items',
            referencedColumnNames: ['id', 'warehouse_id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'fk_item_stock_adjustments_user',
            columnNames: ['adjusted_by_user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'chk_item_stock_adjustments_counted_quantity_not_negative',
            expression: 'counted_quantity >= 0',
          }),
          // Every change to On-hand Quantity is recorded with its reason (AC-09a).
          new TableCheck({
            name: 'chk_item_stock_adjustments_reason_stored_trimmed',
            expression: "reason <> '' AND reason = btrim(reason)",
          }),
        ],
      }),
    );

    // Serves "this Item's on-hand figure with its latest adjustment reason" (sad.md §5,
    // `items/usecases`; AC-08).
    await queryRunner.createIndex(
      'item_stock_adjustments',
      new TableIndex({
        name: 'idx_item_stock_adjustments_item_created',
        columnNames: ['item_id', 'created_at'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'customer_orders',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'warehouse_id', type: 'uuid' },
          { name: 'item_id', type: 'uuid' },
          { name: 'customer_name', type: 'text', collation: 'C' },
          { name: 'quantity', type: 'integer' },
          // Allocation is the only operation that reduces it (`CONTEXT.md` §Invariants).
          { name: 'outstanding_quantity', type: 'integer' },
          { name: 'needed_by', type: 'date' },
          { name: 'state', type: 'varchar', length: '16' },
          { name: 'cancellation_reason', type: 'text', isNullable: true },
          { name: 'recorded_by_user_id', type: 'uuid' },
          { name: 'cancelled_by_user_id', type: 'uuid', isNullable: true },
          { name: 'cancelled_at', type: 'timestamptz', isNullable: true },
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
          // Composite reference target: proves a link joins a line and a Customer Order of one
          // Warehouse (AC-11).
          new TableUnique({
            name: 'uq_customer_orders_id_warehouse',
            columnNames: ['id', 'warehouse_id'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'fk_customer_orders_warehouse_id',
            columnNames: ['warehouse_id'],
            referencedTableName: 'warehouses',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
          // Demand names an Item of the Warehouse the request applies to; an Item of another
          // Warehouse cannot be referenced at all (AC-03).
          new TableForeignKey({
            name: 'fk_customer_orders_item',
            columnNames: ['item_id', 'warehouse_id'],
            referencedTableName: 'items',
            referencedColumnNames: ['id', 'warehouse_id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'fk_customer_orders_recorded_by_user',
            columnNames: ['recorded_by_user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'fk_customer_orders_cancelled_by_user',
            columnNames: ['cancelled_by_user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'chk_customer_orders_state',
            expression: "state IN ('unfulfilled', 'fulfilled', 'cancelled')",
          }),
          new TableCheck({
            name: 'chk_customer_orders_customer_name_stored_trimmed',
            expression:
              "customer_name <> '' AND customer_name = btrim(customer_name)",
          }),
          // Every demanded quantity is a positive whole number (AC-02).
          new TableCheck({
            name: 'chk_customer_orders_quantity_positive',
            expression: 'quantity > 0',
          }),
          // Outstanding Quantity is a whole number that is never negative and never exceeds what
          // the customer asked for (`CONTEXT.md` §Invariants).
          new TableCheck({
            name: 'chk_customer_orders_outstanding_bounds',
            expression:
              'outstanding_quantity >= 0 AND outstanding_quantity <= quantity',
          }),
          // An order that still counts is waiting for something; one that reached nothing is
          // Fulfilled and leaves the consolidated demand (AC-17a, AC-19).
          new TableCheck({
            name: 'chk_customer_orders_state_outstanding',
            expression: `
              (state = 'unfulfilled' AND outstanding_quantity > 0)
              OR (state = 'fulfilled' AND outstanding_quantity = 0)
              OR state = 'cancelled'
            `,
          }),
          // A cancellation carries its reason, its member and its time, and nothing else does
          // (AC-19a).
          new TableCheck({
            name: 'chk_customer_orders_cancellation_attribution',
            expression: `
              (
                state = 'cancelled'
                AND cancellation_reason IS NOT NULL
                AND cancelled_by_user_id IS NOT NULL
                AND cancelled_at IS NOT NULL
              )
              OR (
                state <> 'cancelled'
                AND cancellation_reason IS NULL
                AND cancelled_by_user_id IS NULL
                AND cancelled_at IS NULL
              )
            `,
          }),
          new TableCheck({
            name: 'chk_customer_orders_cancellation_reason_stored_trimmed',
            expression: `
              cancellation_reason IS NULL
              OR (cancellation_reason <> '' AND cancellation_reason = btrim(cancellation_reason))
            `,
          }),
          new TableCheck({
            name: 'chk_customer_orders_cancellation_order',
            expression: 'cancelled_at IS NULL OR cancelled_at >= created_at',
          }),
        ],
      }),
    );

    // The consolidated-demand aggregation: group the Warehouse's Unfulfilled orders by Item into a
    // total Outstanding Quantity and the earliest needed-by date (sad.md §6.4, §6.5; AC-04). The
    // predicate is carried by the index so the read's cost stays bounded by outstanding demand
    // rather than by history (sad.md §8 Performance).
    await queryRunner.createIndex(
      'customer_orders',
      new TableIndex({
        name: 'idx_customer_orders_unfulfilled_demand',
        columnNames: ['warehouse_id', 'item_id', 'needed_by'],
        where: "state = 'unfulfilled'",
      }),
    );

    // The deterministic whole-list read of `GET /customer-orders` (sad.md §7).
    await queryRunner.createIndex(
      'customer_orders',
      new TableIndex({
        name: 'idx_customer_orders_warehouse_created',
        columnNames: ['warehouse_id', 'created_at', 'id'],
      }),
    );

    // "Does any Customer Order name this Item" — the one query behind the fixed-SKU refusal
    // (sad.md §6.2 step 5, AC-06c).
    await queryRunner.createIndex(
      'customer_orders',
      new TableIndex({
        name: 'idx_customer_orders_item_id',
        columnNames: ['item_id'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'packaging_types',
        columns: [
          { name: 'id', type: 'varchar', length: '32', isPrimary: true },
          { name: 'label', type: 'varchar', length: '100' },
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
            name: 'chk_packaging_types_identifier',
            expression: "id ~ '^[a-z][a-z0-9_]*$'",
          }),
          new TableCheck({
            name: 'chk_packaging_types_label_not_empty',
            expression: "btrim(label) <> ''",
          }),
        ],
      }),
    );

    await queryRunner.manager.insert(
      'packaging_types',
      initialPackagingTypes.map(([id, label]) => ({ id, label })),
    );

    await queryRunner.createTable(
      new Table({
        name: 'purchase_drafts',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'warehouse_id', type: 'uuid' },
          { name: 'state', type: 'varchar', length: '24' },
          // Left unstated while the member has not yet spoken to the supplier (AC-10).
          { name: 'expected_arrival_date', type: 'date', isNullable: true },
          { name: 'created_by_user_id', type: 'uuid' },
          { name: 'readied_by_user_id', type: 'uuid', isNullable: true },
          { name: 'readied_at', type: 'timestamptz', isNullable: true },
          { name: 'closed_by_user_id', type: 'uuid', isNullable: true },
          { name: 'closed_at', type: 'timestamptz', isNullable: true },
          { name: 'closure_reason', type: 'text', isNullable: true },
          // Written once, by the one Arrival Confirmation a draft may ever receive (AC-17b).
          {
            name: 'arrival_confirmed_by_user_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'arrival_confirmed_at',
            type: 'timestamptz',
            isNullable: true,
          },
          { name: 'discarded_by_user_id', type: 'uuid', isNullable: true },
          { name: 'discarded_at', type: 'timestamptz', isNullable: true },
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
          // Composite reference target: a draft, its lines and the Items they name all belong to
          // one Warehouse (AC-11).
          new TableUnique({
            name: 'uq_purchase_drafts_id_warehouse',
            columnNames: ['id', 'warehouse_id'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'fk_purchase_drafts_warehouse_id',
            columnNames: ['warehouse_id'],
            referencedTableName: 'warehouses',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'fk_purchase_drafts_created_by_user',
            columnNames: ['created_by_user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'fk_purchase_drafts_readied_by_user',
            columnNames: ['readied_by_user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'fk_purchase_drafts_closed_by_user',
            columnNames: ['closed_by_user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'fk_purchase_drafts_arrival_confirmed_by_user',
            columnNames: ['arrival_confirmed_by_user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'fk_purchase_drafts_discarded_by_user',
            columnNames: ['discarded_by_user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'chk_purchase_drafts_state',
            expression: `
              state IN ('draft', 'ready_for_ordering', 'closed', 'discarded')
            `,
          }),
          // Closed is only ever reached from Ready for Ordering, and Discarded only from Draft
          // (AC-24a, `CONTEXT.md` §Invariants).
          new TableCheck({
            name: 'chk_purchase_drafts_readiness_attribution',
            expression: `
              (
                state IN ('ready_for_ordering', 'closed')
                AND readied_by_user_id IS NOT NULL
                AND readied_at IS NOT NULL
              )
              OR (
                state IN ('draft', 'discarded')
                AND readied_by_user_id IS NULL
                AND readied_at IS NULL
              )
            `,
          }),
          new TableCheck({
            name: 'chk_purchase_drafts_discard_attribution',
            expression: `
              (
                state = 'discarded'
                AND discarded_by_user_id IS NOT NULL
                AND discarded_at IS NOT NULL
              )
              OR (
                state <> 'discarded'
                AND discarded_by_user_id IS NULL
                AND discarded_at IS NULL
              )
            `,
          }),
          new TableCheck({
            name: 'chk_purchase_drafts_closure_attribution',
            expression: `
              (
                state = 'closed'
                AND closed_by_user_id IS NOT NULL
                AND closed_at IS NOT NULL
              )
              OR (
                state <> 'closed'
                AND closed_by_user_id IS NULL
                AND closed_at IS NULL
                AND closure_reason IS NULL
                AND arrival_confirmed_by_user_id IS NULL
                AND arrival_confirmed_at IS NULL
              )
            `,
          }),
          // A draft reaches Closed through Arrival Confirmation or through a member closing it
          // with a reason — exactly one of the two, never both (AC-17, AC-21, AC-21a).
          new TableCheck({
            name: 'chk_purchase_drafts_closure_path',
            expression: `
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
            `,
          }),
          new TableCheck({
            name: 'chk_purchase_drafts_closure_reason_stored_trimmed',
            expression: `
              closure_reason IS NULL
              OR (closure_reason <> '' AND closure_reason = btrim(closure_reason))
            `,
          }),
          new TableCheck({
            name: 'chk_purchase_drafts_transition_order',
            expression: `
              (readied_at IS NULL OR readied_at >= created_at)
              AND (closed_at IS NULL OR closed_at >= readied_at)
              AND (arrival_confirmed_at IS NULL OR arrival_confirmed_at = closed_at)
              AND (discarded_at IS NULL OR discarded_at >= created_at)
            `,
          }),
        ],
      }),
    );

    // The Warehouse's draft list, and the open-draft predicate the Coverage aggregation joins
    // against (sad.md §6.5, §6.8; AC-16a, AC-21a).
    await queryRunner.createIndex(
      'purchase_drafts',
      new TableIndex({
        name: 'idx_purchase_drafts_warehouse_state_created',
        columnNames: ['warehouse_id', 'state', 'created_at'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'purchase_draft_lines',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'purchase_draft_id', type: 'uuid' },
          { name: 'warehouse_id', type: 'uuid' },
          { name: 'item_id', type: 'uuid' },
          { name: 'ordered_quantity', type: 'integer' },
          // The Pre-receipt Requirement is stated during assembly, so both halves stay unset until
          // the member gives them (AC-10, AC-12).
          {
            name: 'packaging_type_id',
            type: 'varchar',
            length: '32',
            isNullable: true,
          },
          { name: 'value_adding_note', type: 'text', isNullable: true },
          // NULL until Arrival Confirmation; 0 once a line arrived with nothing on it (AC-17b).
          { name: 'received_quantity', type: 'integer', isNullable: true },
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
          // Composite reference target: a link reaches its line, its draft and its Warehouse
          // through one reference, so a link can never join rows of two drafts or two Warehouses
          // (AC-11).
          new TableUnique({
            name: 'uq_purchase_draft_lines_id_draft_warehouse',
            columnNames: ['id', 'purchase_draft_id', 'warehouse_id'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'fk_purchase_draft_lines_draft',
            columnNames: ['purchase_draft_id', 'warehouse_id'],
            referencedTableName: 'purchase_drafts',
            referencedColumnNames: ['id', 'warehouse_id'],
            onDelete: 'RESTRICT',
          }),
          // A line names an Item of the draft's own Warehouse (AC-11).
          new TableForeignKey({
            name: 'fk_purchase_draft_lines_item',
            columnNames: ['item_id', 'warehouse_id'],
            referencedTableName: 'items',
            referencedColumnNames: ['id', 'warehouse_id'],
            onDelete: 'RESTRICT',
          }),
          // Packaging Type referential integrity: a value outside the catalogue cannot be stored
          // (AC-13).
          new TableForeignKey({
            name: 'fk_purchase_draft_lines_packaging_type',
            columnNames: ['packaging_type_id'],
            referencedTableName: 'packaging_types',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          // Every ordered quantity is a positive whole number (`CONTEXT.md` §Invariants).
          new TableCheck({
            name: 'chk_purchase_draft_lines_ordered_quantity_positive',
            expression: 'ordered_quantity > 0',
          }),
          // What arrived is bounded neither above nor below by what was ordered — only by zero
          // (AC-17, `CONTEXT.md` §Invariants).
          new TableCheck({
            name: 'chk_purchase_draft_lines_received_quantity_not_negative',
            expression: 'received_quantity IS NULL OR received_quantity >= 0',
          }),
          new TableCheck({
            name: 'chk_purchase_draft_lines_value_adding_note_stored_trimmed',
            expression: `
              value_adding_note IS NULL
              OR (value_adding_note <> '' AND value_adding_note = btrim(value_adding_note))
            `,
          }),
        ],
      }),
    );

    // The lines of one draft, for the single-draft read and for the lock order of sad.md §6.9.
    await queryRunner.createIndex(
      'purchase_draft_lines',
      new TableIndex({
        name: 'idx_purchase_draft_lines_draft_id',
        columnNames: ['purchase_draft_id'],
      }),
    );

    // "Does any Purchase Draft Line name this Item" — the other half of the fixed-SKU query
    // (sad.md §6.2 step 5, AC-06c).
    await queryRunner.createIndex(
      'purchase_draft_lines',
      new TableIndex({
        name: 'idx_purchase_draft_lines_item_id',
        columnNames: ['item_id'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'purchase_draft_line_links',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'purchase_draft_line_id', type: 'uuid' },
          // Carried so the Coverage aggregation reaches the draft's state in one join rather than
          // two; kept honest by `fk_purchase_draft_line_links_line` (sad.md §6.5).
          { name: 'purchase_draft_id', type: 'uuid' },
          { name: 'warehouse_id', type: 'uuid' },
          { name: 'customer_order_id', type: 'uuid' },
          // How much of the line the member intends for that customer. Never reconciled with the
          // line quantity, the Customer Order, or any other link (AC-11a).
          { name: 'stated_quantity', type: 'integer' },
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
          // One link per (line, Customer Order) pair: re-stating how much of a line is meant for a
          // customer is a quantity change on the existing link (AC-10a), while a *second line*
          // linking to the same Customer Order stays permitted (AC-11a).
          new TableUnique({
            name: 'uq_purchase_draft_line_links_line_order',
            columnNames: ['purchase_draft_line_id', 'customer_order_id'],
          }),
          // Composite reference target: a Demand Snapshot row and an Allocation each name the
          // line and Customer Order their link actually joins, so neither can reach an unlinked
          // Customer Order (AC-18).
          new TableUnique({
            name: 'uq_purchase_draft_line_links_id_line_order',
            columnNames: ['id', 'purchase_draft_line_id', 'customer_order_id'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'fk_purchase_draft_line_links_line',
            columnNames: [
              'purchase_draft_line_id',
              'purchase_draft_id',
              'warehouse_id',
            ],
            referencedTableName: 'purchase_draft_lines',
            referencedColumnNames: ['id', 'purchase_draft_id', 'warehouse_id'],
            onDelete: 'RESTRICT',
          }),
          // A link joins a line and a Customer Order of one Warehouse (AC-11).
          new TableForeignKey({
            name: 'fk_purchase_draft_line_links_customer_order',
            columnNames: ['customer_order_id', 'warehouse_id'],
            referencedTableName: 'customer_orders',
            referencedColumnNames: ['id', 'warehouse_id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'chk_purchase_draft_line_links_stated_quantity_positive',
            expression: 'stated_quantity > 0',
          }),
        ],
      }),
    );

    // The Coverage aggregation: which drafts link to this demand and for what stated quantity
    // (sad.md §6.5; AC-20).
    await queryRunner.createIndex(
      'purchase_draft_line_links',
      new TableIndex({
        name: 'idx_purchase_draft_line_links_customer_order_id',
        columnNames: ['customer_order_id'],
      }),
    );

    // The links of one draft, for the single-draft read and the drift comparison (sad.md §6.8).
    await queryRunner.createIndex(
      'purchase_draft_line_links',
      new TableIndex({
        name: 'idx_purchase_draft_line_links_draft_id',
        columnNames: ['purchase_draft_id'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'purchase_draft_demand_snapshots',
        columns: [
          // At most one Demand Snapshot row per link, expressed as the key itself (sad.md §7).
          {
            name: 'purchase_draft_line_link_id',
            type: 'uuid',
            isPrimary: true,
          },
          { name: 'purchase_draft_line_id', type: 'uuid' },
          { name: 'customer_order_id', type: 'uuid' },
          // The demand exactly as it stood when the draft was frozen. Never updated afterwards:
          // divergence is reported as a Drift Signal instead (AC-16).
          { name: 'captured_quantity', type: 'integer' },
          { name: 'captured_needed_by', type: 'date' },
          { name: 'captured_state', type: 'varchar', length: '16' },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'fk_purchase_draft_demand_snapshots_link',
            columnNames: [
              'purchase_draft_line_link_id',
              'purchase_draft_line_id',
              'customer_order_id',
            ],
            referencedTableName: 'purchase_draft_line_links',
            referencedColumnNames: [
              'id',
              'purchase_draft_line_id',
              'customer_order_id',
            ],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'chk_purchase_draft_demand_snapshots_captured_quantity_positive',
            expression: 'captured_quantity > 0',
          }),
          new TableCheck({
            name: 'chk_purchase_draft_demand_snapshots_captured_state',
            expression: `
              captured_state IN ('unfulfilled', 'fulfilled', 'cancelled')
            `,
          }),
        ],
      }),
    );

    // The drift comparison reads the snapshot rows of one draft's lines beside the Customer Orders
    // as they stand now (sad.md §6.8; AC-16, AC-16a).
    await queryRunner.createIndex(
      'purchase_draft_demand_snapshots',
      new TableIndex({
        name: 'idx_purchase_draft_demand_snapshots_line_id',
        columnNames: ['purchase_draft_line_id'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'arrival_allocations',
        columns: [
          // Arrival Confirmation happens at most once for a draft, so a link carries at most one
          // Allocation; the key says so (AC-17b).
          {
            name: 'purchase_draft_line_link_id',
            type: 'uuid',
            isPrimary: true,
          },
          { name: 'purchase_draft_line_id', type: 'uuid' },
          { name: 'customer_order_id', type: 'uuid' },
          { name: 'allocated_quantity', type: 'integer' },
          { name: 'allocated_by_user_id', type: 'uuid' },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          // An Allocation names a Customer Order its line is actually linked to — proven by the
          // reference rather than re-checked (AC-18).
          new TableForeignKey({
            name: 'fk_arrival_allocations_link',
            columnNames: [
              'purchase_draft_line_link_id',
              'purchase_draft_line_id',
              'customer_order_id',
            ],
            referencedTableName: 'purchase_draft_line_links',
            referencedColumnNames: [
              'id',
              'purchase_draft_line_id',
              'customer_order_id',
            ],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'fk_arrival_allocations_user',
            columnNames: ['allocated_by_user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          // A line whose linked demand has all gone records no Allocation at all, rather than one
          // of nothing (AC-17b).
          new TableCheck({
            name: 'chk_arrival_allocations_allocated_quantity_positive',
            expression: 'allocated_quantity > 0',
          }),
        ],
      }),
    );

    // The locked "total already allocated to this Customer Order" read behind the amendment floor
    // (sad.md §6.10; AC-19b).
    await queryRunner.createIndex(
      'arrival_allocations',
      new TableIndex({
        name: 'idx_arrival_allocations_customer_order_id',
        columnNames: ['customer_order_id'],
      }),
    );

    // The Allocations of one line, for the arrival bound of AC-18 and the single-draft read.
    await queryRunner.createIndex(
      'arrival_allocations',
      new TableIndex({
        name: 'idx_arrival_allocations_line_id',
        columnNames: ['purchase_draft_line_id'],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('arrival_allocations');
    await queryRunner.dropTable('purchase_draft_demand_snapshots');
    await queryRunner.dropTable('purchase_draft_line_links');
    await queryRunner.dropTable('purchase_draft_lines');
    await queryRunner.dropTable('purchase_drafts');
    await queryRunner.dropTable('packaging_types');
    await queryRunner.dropTable('customer_orders');
    await queryRunner.dropTable('item_stock_adjustments');
    await queryRunner.dropTable('items');
  }
}
