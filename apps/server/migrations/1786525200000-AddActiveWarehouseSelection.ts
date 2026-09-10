import type { MigrationInterface, QueryRunner } from 'typeorm';
import { TableColumn } from 'typeorm';

// Migrations 02 and 04 of this release already refuse to apply over existing `users` and
// `warehouse_memberships` rows, so by the time the selection column is added the table is empty by
// construction. Asserting it here keeps the release's precondition uniform: every migration that
// depends on the rebuild states that dependency instead of inheriting it silently.
const assertEmpty = async (queryRunner: QueryRunner): Promise<void> => {
  const [{ count }] = (await queryRunner.query(
    'SELECT count(*)::int AS count FROM users',
  )) as [{ count: number }];
  if (count > 0) {
    throw new Error(
      `Cannot apply the Active Warehouse selection: "users" holds ${count} row(s). ` +
        'This release rebuilds Workspace, Warehouse and membership data rather than migrating it ' +
        '(spec.md §1, fourth boundary). Roll every migration back and run them again from the ' +
        'beginning.',
    );
  }
};

export class AddActiveWarehouseSelection1786525200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await assertEmpty(queryRunner);

    // Presentation state stored against the member rather than the device (AC-03). It is never an
    // input to an authorization decision; both guards read memberships, never this column.
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'active_warehouse_id',
        type: 'uuid',
        isNullable: true,
      }),
    );

    // The selection is constrained to a Warehouse the member actually holds a membership in, and
    // is cleared when that membership is withdrawn (sad.md §6.6). Under the default MATCH SIMPLE
    // semantics the reference is not checked while `active_warehouse_id` is NULL, which is the
    // "no selection yet" state of AC-03b.
    //
    // Raw SQL rather than `TableForeignKey`: the column-list form of ON DELETE SET NULL
    // (PostgreSQL 15+, and this repository runs postgres:17-alpine) is outside TypeORM's
    // `OnDeleteType` union. Without the column list PostgreSQL would also try to null `id`.
    await queryRunner.query(`
      ALTER TABLE users
        ADD CONSTRAINT fk_users_active_warehouse
        FOREIGN KEY (id, active_warehouse_id)
        REFERENCES warehouse_memberships (user_id, warehouse_id)
        ON DELETE SET NULL (active_warehouse_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE users DROP CONSTRAINT fk_users_active_warehouse',
    );
    await queryRunner.dropColumn('users', 'active_warehouse_id');
  }
}
