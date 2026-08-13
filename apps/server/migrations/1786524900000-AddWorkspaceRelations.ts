import {
  type MigrationInterface,
  type QueryRunner,
  TableCheck,
  TableColumn,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

// spec.md §1 (fourth boundary) and §3: no deployment holds Warehouse, membership or Role data that
// must survive this change, so the new non-null Workspace relations are added without backfill.
// The migration asserts that precondition instead of assuming it silently.
const assertEmpty = async (
  queryRunner: QueryRunner,
  tables: readonly string[],
): Promise<void> => {
  for (const table of tables) {
    const [{ count }] = (await queryRunner.query(
      `SELECT count(*)::int AS count FROM ${table}`,
    )) as [{ count: number }];
    if (count > 0) {
      throw new Error(
        `Cannot apply the workspaces schema: "${table}" holds ${count} row(s). ` +
          'This release adds non-null Workspace relations without backfill (spec.md §1, fourth ' +
          'boundary). Roll every migration back and run them again from the beginning.',
      );
    }
  }
};

export class AddWorkspaceRelations1786524900000 implements MigrationInterface {
  // The reviewed migration remains one atomic schema operation.

  async up(queryRunner: QueryRunner): Promise<void> {
    await assertEmpty(queryRunner, ['users', 'warehouses']);

    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'workspace_id',
        type: 'uuid',
        isNullable: false,
      }),
    );

    // A User belongs to a Workspace through a relation established when that User is created and
    // never re-derived from their Warehouse memberships (spec.md §1, second boundary).
    // The reference is deferred so registration may insert the User and the Workspace in either
    // order inside its single transaction, matching the accounts/users precedent in
    // 1753444800000-CreateAuthSchema.
    await queryRunner.createForeignKey(
      'users',
      new TableForeignKey({
        name: 'fk_users_workspace_id',
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
        deferrable: 'INITIALLY DEFERRED',
      }),
    );

    // Referenced by the composite keys that prove a Workspace membership and a Warehouse
    // membership never cross the User's own Workspace.
    await queryRunner.createUniqueConstraint(
      'users',
      new TableUnique({
        name: 'uq_users_id_workspace',
        columnNames: ['id', 'workspace_id'],
      }),
    );

    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'idx_users_workspace_id',
        columnNames: ['workspace_id', 'id'],
      }),
    );

    await queryRunner.addColumn(
      'warehouses',
      new TableColumn({
        name: 'workspace_id',
        type: 'uuid',
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      'warehouses',
      new TableColumn({
        name: 'archived_at',
        type: 'timestamptz',
        isNullable: true,
      }),
    );

    await queryRunner.createForeignKey(
      'warehouses',
      new TableForeignKey({
        name: 'fk_warehouses_workspace_id',
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );

    await queryRunner.createUniqueConstraint(
      'warehouses',
      new TableUnique({
        name: 'uq_warehouses_id_workspace',
        columnNames: ['id', 'workspace_id'],
      }),
    );

    await queryRunner.createCheckConstraint(
      'warehouses',
      new TableCheck({
        name: 'chk_warehouses_archival_order',
        expression: 'archived_at IS NULL OR archived_at >= created_at',
      }),
    );

    // Serves the deterministic Warehouse list of one Workspace (AC-33) and the locked
    // last-non-archived re-count in sad.md §6.5.
    await queryRunner.createIndex(
      'warehouses',
      new TableIndex({
        name: 'idx_warehouses_workspace_name',
        columnNames: ['workspace_id', 'name', 'id'],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('warehouses', 'idx_warehouses_workspace_name');
    await queryRunner.dropCheckConstraint(
      'warehouses',
      'chk_warehouses_archival_order',
    );
    await queryRunner.dropUniqueConstraint(
      'warehouses',
      'uq_warehouses_id_workspace',
    );
    await queryRunner.dropForeignKey(
      'warehouses',
      'fk_warehouses_workspace_id',
    );
    await queryRunner.dropColumn('warehouses', 'archived_at');
    await queryRunner.dropColumn('warehouses', 'workspace_id');

    await queryRunner.dropIndex('users', 'idx_users_workspace_id');
    await queryRunner.dropUniqueConstraint('users', 'uq_users_id_workspace');
    await queryRunner.dropForeignKey('users', 'fk_users_workspace_id');
    await queryRunner.dropColumn('users', 'workspace_id');
  }
}
