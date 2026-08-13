import {
  type MigrationInterface,
  type QueryRunner,
  TableColumn,
} from 'typeorm';

export class AddActiveWarehouseSelection1786550800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
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
