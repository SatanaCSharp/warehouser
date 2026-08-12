import {
  type MigrationInterface,
  type QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateWorkspaceMemberships1786550600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'workspace_memberships',
        columns: [
          // A User belongs to exactly one Workspace and holds exactly one Workspace Role there,
          // so the User alone keys the membership (spec.md §3, AC-19, AC-19b).
          { name: 'user_id', type: 'uuid', isPrimary: true },
          { name: 'workspace_id', type: 'uuid' },
          { name: 'workspace_role_id', type: 'uuid' },
          { name: 'workspace_role_kind', type: 'varchar', length: '24' },
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
        foreignKeys: [
          // Proves the membership is in the User's own Workspace (AC-28, AC-34).
          new TableForeignKey({
            name: 'fk_workspace_memberships_user_workspace',
            columnNames: ['user_id', 'workspace_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id', 'workspace_id'],
            onDelete: 'RESTRICT',
          }),
          // Proves a Workspace Role assignment never crosses a Workspace (AC-34).
          new TableForeignKey({
            name: 'fk_workspace_memberships_role',
            columnNames: [
              'workspace_role_id',
              'workspace_id',
              'workspace_role_kind',
            ],
            referencedTableName: 'workspace_roles',
            referencedColumnNames: ['id', 'workspace_id', 'kind'],
            onDelete: 'RESTRICT',
          }),
        ],
      }),
    );

    await queryRunner.createIndex(
      'workspace_memberships',
      new TableIndex({
        name: 'idx_workspace_memberships_workspace_user',
        columnNames: ['workspace_id', 'user_id'],
      }),
    );

    await queryRunner.createIndex(
      'workspace_memberships',
      new TableIndex({
        name: 'idx_workspace_memberships_role_id',
        columnNames: ['workspace_role_id'],
      }),
    );

    // At most one Workspace Owner assignment per Workspace; the final arbiter under a
    // concurrent Owner transfer (AC-26 – AC-28).
    await queryRunner.createIndex(
      'workspace_memberships',
      new TableIndex({
        name: 'uq_workspace_memberships_one_owner',
        columnNames: ['workspace_id'],
        isUnique: true,
        where: "workspace_role_kind = 'workspace_owner'",
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('workspace_memberships');
  }
}
