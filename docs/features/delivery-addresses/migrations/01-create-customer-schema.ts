import {
  type MigrationInterface,
  type QueryRunner,
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

// The two durable records this feature introduces (`sad.md` §7 "New durable concepts"): the
// Customer a Warehouse owns, and the Delivery Addresses that Customer's goods may be sent to.
//
// Both relations are new, so nothing here backfills, rewrites or drops shipped data. The changes to
// the five relations `ordering` and `workspaces` already shipped are migration 02, which depends on
// `customer_delivery_addresses` existing.
export class CreateCustomerSchema1786700000000 implements MigrationInterface {
  // eslint-disable-next-line max-lines-per-function
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'customers',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'warehouse_id', type: 'uuid' },
          // Collation `C` follows `warehouses.name`, `roles.name`, `items.sku` and
          // `customer_orders.customer_name`: deterministic, bytewise, non-normalising comparison.
          // That is what makes uniqueness case-sensitive, which `spec.md` §8 (seventh question)
          // takes at its stated default — "Acme" and "acme" are two Customers, and the §7
          // fragmentation KPI is the trigger to revisit it.
          { name: 'name', type: 'text', collation: 'C' },
          // Activation is the instant it happened, mirroring `warehouses.archived_at` and
          // `items.deactivated_at`. Reactivation clears it; the name stays taken either way
          // (AC-06).
          { name: 'deactivated_at', type: 'timestamptz', isNullable: true },
          // "together with the member who recorded it and when" (AC-01).
          { name: 'recorded_by_user_id', type: 'uuid' },
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
          // A customer name identifies at most one Customer within a Warehouse, active or Inactive
          // alike (AC-03, AC-03c), and never across Warehouses (AC-03a). Deactivation never
          // releases it (AC-06). `sad.md` §7 requires this to be the database constraint rather
          // than an application check, so concurrency cannot produce two.
          new TableUnique({
            name: 'uq_customers_warehouse_name',
            columnNames: ['warehouse_id', 'name'],
          }),
          // Composite reference target: proves a Delivery Address and a Customer Order name a
          // Customer of their own Warehouse (AC-12).
          new TableUnique({
            name: 'uq_customers_id_warehouse',
            columnNames: ['id', 'warehouse_id'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'fk_customers_warehouse_id',
            columnNames: ['warehouse_id'],
            referencedTableName: 'warehouses',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'fk_customers_recorded_by_user',
            columnNames: ['recorded_by_user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          // A name that is empty or only spaces is refused (AC-02).
          new TableCheck({
            name: 'chk_customers_name_stored_trimmed',
            expression: "name <> '' AND name = btrim(name)",
          }),
          new TableCheck({
            name: 'chk_customers_deactivation_order',
            expression:
              'deactivated_at IS NULL OR deactivated_at >= created_at',
          }),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'customer_delivery_addresses',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'customer_id', type: 'uuid' },
          // Carried so a Purchase Draft Line can prove in one reference that the address it ships
          // to belongs to a Customer of the line's own Warehouse. Kept honest by
          // `fk_customer_delivery_addresses_customer`, which references
          // `customers(id, warehouse_id)` — an address whose Warehouse column disagreed with its
          // Customer's could not be written at all.
          { name: 'warehouse_id', type: 'uuid' },
          // Text a member types for a human driver to read. Never validated, geocoded or
          // interpreted (`spec.md` §3), and rendered as text and never as markup (§6.1).
          { name: 'address_text', type: 'text' },
          // Gate codes, opening hours, delivery windows. Confidential at the same classification
          // as the Customer that carries them (`sad.md` §8).
          { name: 'access_notes', type: 'text', isNullable: true },
          // The one address a Customer Order takes when the member states none (AC-11).
          { name: 'is_main', type: 'boolean', default: false },
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
          // Composite reference target: proves a Customer Order's Delivery Address belongs to the
          // Customer that same order names (`CONTEXT.md` §Invariants, AC-11c).
          new TableUnique({
            name: 'uq_customer_delivery_addresses_id_customer',
            columnNames: ['id', 'customer_id'],
          }),
          // Composite reference target: proves a Direct to Customer Purchase Draft Line ships to
          // an address of its own Warehouse (AC-12).
          new TableUnique({
            name: 'uq_customer_delivery_addresses_id_warehouse',
            columnNames: ['id', 'warehouse_id'],
          }),
        ],
        foreignKeys: [
          // A Delivery Address belongs to exactly one Customer of exactly one Warehouse
          // (`sad.md` §7).
          new TableForeignKey({
            name: 'fk_customer_delivery_addresses_customer',
            columnNames: ['customer_id', 'warehouse_id'],
            referencedTableName: 'customers',
            referencedColumnNames: ['id', 'warehouse_id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          // A Delivery Address whose text is empty is refused (AC-02).
          new TableCheck({
            name: 'chk_customer_delivery_addresses_address_text_stored_trimmed',
            expression:
              "address_text <> '' AND address_text = btrim(address_text)",
          }),
          new TableCheck({
            name: 'chk_customer_delivery_addresses_access_notes_stored_trimmed',
            expression: `
              access_notes IS NULL
              OR (access_notes <> '' AND access_notes = btrim(access_notes))
            `,
          }),
          // An Inactive address is never the Main one. This is what makes AC-06b structural — the
          // Main flag has to move to a remaining active address in the same transaction — and what
          // makes reactivating a once-Main address safe, since it comes back as an ordinary
          // address rather than as a second Main one (AC-06a).
          new TableCheck({
            name: 'chk_customer_delivery_addresses_main_is_active',
            expression: 'is_main = false OR deactivated_at IS NULL',
          }),
          new TableCheck({
            name: 'chk_customer_delivery_addresses_deactivation_order',
            expression:
              'deactivated_at IS NULL OR deactivated_at >= created_at',
          }),
        ],
      }),
    );

    // At most one Main Delivery Address per Customer (AC-04, AC-05). Partial, because the flag is
    // false on every other address of that Customer and a plain unique constraint would admit only
    // one non-Main address. Combined with `chk_customer_delivery_addresses_main_is_active` the
    // predicate needs no `deactivated_at` clause: an Inactive row can never carry the flag.
    //
    // The "at least one" half of AC-05 is deliberately NOT here — see `data-model.md`
    // §"Constraints the model deliberately does not express".
    await queryRunner.createIndex(
      'customer_delivery_addresses',
      new TableIndex({
        name: 'uq_customer_delivery_addresses_customer_main',
        columnNames: ['customer_id'],
        isUnique: true,
        where: 'is_main',
      }),
    );

    // One Customer's addresses: the address list on the Customer detail (AC-04), the active-address
    // count on the Customer list, the picker's active set (AC-06a), and the `FOR UPDATE` read
    // behind the last-active-address condition (`sad.md` §6.3, AC-07).
    await queryRunner.createIndex(
      'customer_delivery_addresses',
      new TableIndex({
        name: 'idx_customer_delivery_addresses_customer_active',
        columnNames: ['customer_id', 'deactivated_at'],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('customer_delivery_addresses');
    await queryRunner.dropTable('customers');
  }
}
