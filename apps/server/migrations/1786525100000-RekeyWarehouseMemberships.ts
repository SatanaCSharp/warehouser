import type { MigrationInterface, QueryRunner } from 'typeorm';
import { TableColumn, TableForeignKey, TableIndex } from 'typeorm';

// The membership key changes from (User) to (User, Warehouse), which no existing row can be
// migrated into or out of automatically. spec.md §1 (fourth boundary) authorizes the rebuild;
// the assertion makes the precondition explicit rather than assumed.
const assertEmpty = async (
  queryRunner: QueryRunner,
  direction: 'apply' | 'revert',
): Promise<void> => {
  const [{ count }] = (await queryRunner.query(
    'SELECT count(*)::int AS count FROM warehouse_memberships',
  )) as [{ count: number }];
  if (count > 0) {
    throw new Error(
      `Cannot ${direction} the warehouse membership key change: "warehouse_memberships" holds ` +
        `${count} row(s). This release re-keys memberships without data migration ` +
        '(spec.md §1, fourth boundary). Roll every migration back and run them again from the ' +
        'beginning.',
    );
  }
};

export class RekeyWarehouseMemberships1786525100000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await assertEmpty(queryRunner, 'apply');

    // Replaced below by composite references that additionally prove the Workspace relation.
    await queryRunner.dropForeignKey(
      'warehouse_memberships',
      'fk_warehouse_memberships_user_id',
    );
    await queryRunner.dropForeignKey(
      'warehouse_memberships',
      'fk_warehouse_memberships_warehouse_id',
    );

    // A member may now hold a membership in several Warehouses of their Workspace, and holds at
    // most one Role in any one Warehouse (AC-23, AC-25).
    await queryRunner.dropPrimaryKey('warehouse_memberships');
    await queryRunner.createPrimaryKey('warehouse_memberships', [
      'user_id',
      'warehouse_id',
    ]);

    await queryRunner.addColumn(
      'warehouse_memberships',
      new TableColumn({
        name: 'workspace_id',
        type: 'uuid',
        isNullable: false,
      }),
    );

    // The two composite references together make "all of a User's Warehouse memberships belong to
    // Warehouses of that User's Workspace" a schema guarantee rather than a command-time check
    // (spec.md AC-24, CONTEXT.md invariants).
    await queryRunner.createForeignKey(
      'warehouse_memberships',
      new TableForeignKey({
        name: 'fk_warehouse_memberships_user_workspace',
        columnNames: ['user_id', 'workspace_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id', 'workspace_id'],
        onDelete: 'RESTRICT',
      }),
    );
    await queryRunner.createForeignKey(
      'warehouse_memberships',
      new TableForeignKey({
        name: 'fk_warehouse_memberships_warehouse_workspace',
        columnNames: ['warehouse_id', 'workspace_id'],
        referencedTableName: 'warehouses',
        referencedColumnNames: ['id', 'workspace_id'],
        onDelete: 'RESTRICT',
      }),
    );

    // Serves the "Users of the Workspace and the Warehouses each belongs to" read that
    // WORKSPACE_MEMBERS:WATCH carries (AC-33), in one index scan per Workspace.
    await queryRunner.createIndex(
      'warehouse_memberships',
      new TableIndex({
        name: 'idx_warehouse_memberships_workspace_user',
        columnNames: ['workspace_id', 'user_id', 'warehouse_id'],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await assertEmpty(queryRunner, 'revert');

    await queryRunner.dropIndex(
      'warehouse_memberships',
      'idx_warehouse_memberships_workspace_user',
    );
    await queryRunner.dropForeignKey(
      'warehouse_memberships',
      'fk_warehouse_memberships_warehouse_workspace',
    );
    await queryRunner.dropForeignKey(
      'warehouse_memberships',
      'fk_warehouse_memberships_user_workspace',
    );
    await queryRunner.dropColumn('warehouse_memberships', 'workspace_id');

    await queryRunner.dropPrimaryKey('warehouse_memberships');
    await queryRunner.createPrimaryKey('warehouse_memberships', ['user_id']);

    await queryRunner.createForeignKey(
      'warehouse_memberships',
      new TableForeignKey({
        name: 'fk_warehouse_memberships_user_id',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );
    await queryRunner.createForeignKey(
      'warehouse_memberships',
      new TableForeignKey({
        name: 'fk_warehouse_memberships_warehouse_id',
        columnNames: ['warehouse_id'],
        referencedTableName: 'warehouses',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );
  }
}
