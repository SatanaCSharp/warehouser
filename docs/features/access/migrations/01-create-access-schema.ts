import {
  type MigrationInterface,
  type QueryRunner,
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

const initialPermissions = [
  ['USERS:CREATE', 'Create users', 'assignable'],
  ['ROLES:ASSIGN', 'Assign roles', 'assignable'],
  ['ROLES:CREATE', 'Create roles', 'assignable'],
  ['ROLES:UPDATE', 'Update roles', 'assignable'],
  ['ROLES:DELETE', 'Delete roles', 'assignable'],
  ['USERS:UPDATE', 'Update users', 'assignable'],
  ['USERS:WATCH', 'View users', 'assignable'],
  ['ROLES:WATCH', 'View roles', 'assignable'],
  [
    'WAREHOUSE_MANAGER_ROLE:REASSIGN',
    'Transfer warehouse management',
    'reserved',
  ],
] as const;

export class CreateAccessSchema01 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'warehouses',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'name', type: 'text', collation: 'C' },
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
            name: 'chk_warehouses_name_stored_trimmed',
            expression: "name <> '' AND name = btrim(name)",
          }),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'permissions',
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
            name: 'uq_permissions_id_kind',
            columnNames: ['id', 'kind'],
          }),
        ],
        checks: [
          new TableCheck({
            name: 'chk_permissions_identifier',
            expression: "id ~ '^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*$'",
          }),
          new TableCheck({
            name: 'chk_permissions_label_not_empty',
            expression: "btrim(label) <> ''",
          }),
          new TableCheck({
            name: 'chk_permissions_kind',
            expression: "kind IN ('assignable', 'reserved')",
          }),
        ],
      }),
    );

    await queryRunner.createIndex(
      'permissions',
      new TableIndex({
        name: 'idx_permissions_kind_id',
        columnNames: ['kind', 'id'],
      }),
    );

    await queryRunner.manager.insert(
      'permissions',
      initialPermissions.map(([id, label, kind]) => ({ id, label, kind })),
    );

    await queryRunner.createTable(
      new Table({
        name: 'roles',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'warehouse_id', type: 'uuid' },
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
            name: 'uq_roles_warehouse_name',
            columnNames: ['warehouse_id', 'name'],
          }),
          new TableUnique({
            name: 'uq_roles_id_kind',
            columnNames: ['id', 'kind'],
          }),
          new TableUnique({
            name: 'uq_roles_id_warehouse_kind',
            columnNames: ['id', 'warehouse_id', 'kind'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'fk_roles_warehouse_id',
            columnNames: ['warehouse_id'],
            referencedTableName: 'warehouses',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'chk_roles_name_stored_trimmed',
            expression: "name <> '' AND name = btrim(name)",
          }),
          new TableCheck({
            name: 'chk_roles_kind',
            expression: "kind IN ('custom', 'warehouse_manager')",
          }),
        ],
      }),
    );

    await queryRunner.createIndex(
      'roles',
      new TableIndex({
        name: 'uq_roles_one_manager_per_warehouse',
        columnNames: ['warehouse_id'],
        isUnique: true,
        where: "kind = 'warehouse_manager'",
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'role_permissions',
        columns: [
          { name: 'role_id', type: 'uuid', isPrimary: true },
          {
            name: 'permission_id',
            type: 'varchar',
            length: '64',
            isPrimary: true,
          },
          { name: 'role_kind', type: 'varchar', length: '24' },
          { name: 'permission_kind', type: 'varchar', length: '16' },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'fk_role_permissions_role',
            columnNames: ['role_id', 'role_kind'],
            referencedTableName: 'roles',
            referencedColumnNames: ['id', 'kind'],
            onDelete: 'CASCADE',
          }),
          new TableForeignKey({
            name: 'fk_role_permissions_permission',
            columnNames: ['permission_id', 'permission_kind'],
            referencedTableName: 'permissions',
            referencedColumnNames: ['id', 'kind'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'chk_role_permissions_reserved_exclusive',
            expression:
              "role_kind = 'warehouse_manager' OR permission_kind = 'assignable'",
          }),
        ],
      }),
    );

    await queryRunner.createIndex(
      'role_permissions',
      new TableIndex({
        name: 'idx_role_permissions_permission_id',
        columnNames: ['permission_id', 'role_id'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'warehouse_memberships',
        columns: [
          { name: 'user_id', type: 'uuid', isPrimary: true },
          { name: 'warehouse_id', type: 'uuid' },
          { name: 'role_id', type: 'uuid' },
          { name: 'role_kind', type: 'varchar', length: '24' },
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
          new TableForeignKey({
            name: 'fk_warehouse_memberships_user_id',
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'fk_warehouse_memberships_warehouse_id',
            columnNames: ['warehouse_id'],
            referencedTableName: 'warehouses',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'fk_warehouse_memberships_role',
            columnNames: ['role_id', 'warehouse_id', 'role_kind'],
            referencedTableName: 'roles',
            referencedColumnNames: ['id', 'warehouse_id', 'kind'],
            onDelete: 'RESTRICT',
          }),
        ],
      }),
    );

    await queryRunner.createIndex(
      'warehouse_memberships',
      new TableIndex({
        name: 'idx_warehouse_memberships_warehouse_user',
        columnNames: ['warehouse_id', 'user_id'],
      }),
    );
    await queryRunner.createIndex(
      'warehouse_memberships',
      new TableIndex({
        name: 'idx_warehouse_memberships_role_id',
        columnNames: ['role_id'],
      }),
    );
    await queryRunner.createIndex(
      'warehouse_memberships',
      new TableIndex({
        name: 'uq_warehouse_memberships_one_manager',
        columnNames: ['warehouse_id'],
        isUnique: true,
        where: "role_kind = 'warehouse_manager'",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('warehouse_memberships');
    await queryRunner.dropTable('role_permissions');
    await queryRunner.dropTable('roles');
    await queryRunner.dropTable('permissions');
    await queryRunner.dropTable('warehouses');
  }
}
