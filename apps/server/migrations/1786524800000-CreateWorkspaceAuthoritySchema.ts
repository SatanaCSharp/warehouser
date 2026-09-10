import type { MigrationInterface, QueryRunner } from 'typeorm';
import {
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

// spec.md §1 fixes the initial Workspace Owner Workspace Permission set.
// `WORKSPACE_OWNER_ROLE:REASSIGN` is the only reserved entry: it stays exclusive to the
// protected Workspace Owner Role and is ineligible for custom Workspace Roles (AC-18, AC-35).
export const initialWorkspacePermissions = [
  ['WORKSPACE:RENAME', 'Rename workspace', 'assignable'],
  ['WORKSPACE_ROLES:WATCH', 'View workspace roles', 'assignable'],
  ['WORKSPACE_ROLES:CREATE', 'Create workspace roles', 'assignable'],
  ['WORKSPACE_ROLES:UPDATE', 'Update workspace roles', 'assignable'],
  ['WORKSPACE_ROLES:DELETE', 'Delete workspace roles', 'assignable'],
  ['WORKSPACE_ROLES:ASSIGN', 'Assign workspace roles', 'assignable'],
  ['WORKSPACE_MEMBERS:WATCH', 'View workspace members', 'assignable'],
  ['WORKSPACE_MEMBERS:ADD', 'Add workspace members', 'assignable'],
  ['WORKSPACE_MEMBERS:REMOVE', 'Remove workspace members', 'assignable'],
  ['WAREHOUSES:WATCH', 'View warehouses', 'assignable'],
  ['WAREHOUSES:CREATE', 'Create warehouses', 'assignable'],
  ['WAREHOUSES:RENAME', 'Rename warehouses', 'assignable'],
  ['WAREHOUSES:ARCHIVE', 'Archive and restore warehouses', 'assignable'],
  [
    'WAREHOUSE_MEMBERSHIPS:ASSIGN',
    'Assign warehouse memberships',
    'assignable',
  ],
  [
    'WAREHOUSE_MEMBERSHIPS:REVOKE',
    'Revoke warehouse memberships',
    'assignable',
  ],
  ['WORKSPACE_OWNER_ROLE:REASSIGN', 'Transfer workspace ownership', 'reserved'],
] as const;

export class CreateWorkspaceAuthoritySchema1786524800000 implements MigrationInterface {
  // The reviewed migration remains one atomic schema operation.

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'workspaces',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          {
            name: 'name',
            type: 'text',
            collation: 'C',
            isNullable: true,
          },
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
          // A Workspace is created without a name and presented with a placeholder until one is
          // set (AC-29); a stored name obeys the approved Warehouse-name storage rules.
          new TableCheck({
            name: 'chk_workspaces_name_stored_trimmed',
            expression: "name IS NULL OR (name <> '' AND name = btrim(name))",
          }),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'workspace_permissions',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          { name: 'label', type: 'varchar', length: '100' },
          { name: 'kind', type: 'varchar', length: '16' },
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
          new TableUnique({
            name: 'uq_workspace_permissions_id_kind',
            columnNames: ['id', 'kind'],
          }),
        ],
        checks: [
          new TableCheck({
            name: 'chk_workspace_permissions_identifier',
            expression: "id ~ '^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*$'",
          }),
          new TableCheck({
            name: 'chk_workspace_permissions_label_not_empty',
            expression: "btrim(label) <> ''",
          }),
          new TableCheck({
            name: 'chk_workspace_permissions_kind',
            expression: "kind IN ('assignable', 'reserved')",
          }),
        ],
      }),
    );

    await queryRunner.createIndex(
      'workspace_permissions',
      new TableIndex({
        name: 'idx_workspace_permissions_kind_id',
        columnNames: ['kind', 'id'],
      }),
    );

    await queryRunner.manager.insert(
      'workspace_permissions',
      initialWorkspacePermissions.map(([id, label, kind]) => ({
        id,
        label,
        kind,
      })),
    );

    await queryRunner.createTable(
      new Table({
        name: 'workspace_roles',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'workspace_id', type: 'uuid' },
          { name: 'name', type: 'text', collation: 'C' },
          { name: 'kind', type: 'varchar', length: '24' },
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
          new TableUnique({
            name: 'uq_workspace_roles_workspace_name',
            columnNames: ['workspace_id', 'name'],
          }),
          new TableUnique({
            name: 'uq_workspace_roles_id_kind',
            columnNames: ['id', 'kind'],
          }),
          new TableUnique({
            name: 'uq_workspace_roles_id_workspace_kind',
            columnNames: ['id', 'workspace_id', 'kind'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'fk_workspace_roles_workspace_id',
            columnNames: ['workspace_id'],
            referencedTableName: 'workspaces',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'chk_workspace_roles_name_stored_trimmed',
            expression: "name <> '' AND name = btrim(name)",
          }),
          new TableCheck({
            name: 'chk_workspace_roles_kind',
            expression: "kind IN ('custom', 'workspace_owner')",
          }),
        ],
      }),
    );

    // At most one protected Workspace Owner Role per Workspace (AC-16, AC-26 – AC-28).
    await queryRunner.createIndex(
      'workspace_roles',
      new TableIndex({
        name: 'uq_workspace_roles_one_owner_per_workspace',
        columnNames: ['workspace_id'],
        isUnique: true,
        where: "kind = 'workspace_owner'",
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'workspace_role_permissions',
        columns: [
          { name: 'workspace_role_id', type: 'uuid', isPrimary: true },
          {
            name: 'workspace_permission_id',
            type: 'varchar',
            length: '64',
            isPrimary: true,
          },
          { name: 'workspace_role_kind', type: 'varchar', length: '24' },
          { name: 'workspace_permission_kind', type: 'varchar', length: '16' },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'fk_workspace_role_permissions_role',
            columnNames: ['workspace_role_id', 'workspace_role_kind'],
            referencedTableName: 'workspace_roles',
            referencedColumnNames: ['id', 'kind'],
            onDelete: 'CASCADE',
          }),
          new TableForeignKey({
            name: 'fk_workspace_role_permissions_permission',
            columnNames: [
              'workspace_permission_id',
              'workspace_permission_kind',
            ],
            referencedTableName: 'workspace_permissions',
            referencedColumnNames: ['id', 'kind'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          // A reserved Workspace Permission can never be granted to a custom Workspace
          // Role (AC-18).
          new TableCheck({
            name: 'chk_workspace_role_permissions_reserved_exclusive',
            expression:
              "workspace_role_kind = 'workspace_owner' OR workspace_permission_kind = 'assignable'",
          }),
        ],
      }),
    );

    await queryRunner.createIndex(
      'workspace_role_permissions',
      new TableIndex({
        name: 'idx_workspace_role_permissions_permission_id',
        columnNames: ['workspace_permission_id', 'workspace_role_id'],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('workspace_role_permissions');
    await queryRunner.dropTable('workspace_roles');
    await queryRunner.dropTable('workspace_permissions');
    await queryRunner.dropTable('workspaces');
  }
}
