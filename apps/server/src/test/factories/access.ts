import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

export interface WarehouseFixture {
  readonly id: string;
  readonly name: string;
}

export interface PermissionFixture {
  readonly id: string;
  readonly label: string;
  readonly kind: 'assignable' | 'reserved';
}

export interface RoleFixture {
  readonly id: string;
  readonly warehouseId: string;
  readonly name: string;
  readonly kind: 'custom' | 'warehouse_manager';
  readonly permissionIds: readonly string[];
}

export interface WarehouseMembershipFixture {
  readonly userId: string;
  readonly warehouseId: string;
  readonly roleId: string;
  readonly roleKind: 'custom' | 'warehouse_manager';
}

export const buildWarehouse = (
  overrides: Partial<WarehouseFixture> = {},
): WarehouseFixture => ({
  id: randomUUID(),
  name: 'Склад приклад',
  ...overrides,
});

export const buildPermission = (
  overrides: Partial<PermissionFixture> = {},
): PermissionFixture => ({
  id: 'ROLES:WATCH',
  label: 'View roles',
  kind: 'assignable',
  ...overrides,
});

export const buildRole = (
  overrides: Partial<RoleFixture> = {},
): RoleFixture => ({
  id: randomUUID(),
  warehouseId: randomUUID(),
  name: 'Team member',
  kind: 'custom',
  permissionIds: [],
  ...overrides,
});

export const buildWarehouseMembership = (
  overrides: Partial<WarehouseMembershipFixture> = {},
): WarehouseMembershipFixture => ({
  userId: randomUUID(),
  warehouseId: randomUUID(),
  roleId: randomUUID(),
  roleKind: 'custom',
  ...overrides,
});

const insertIdentity = async (
  dataSource: DataSource,
  userId: string,
): Promise<void> => {
  const accountId = userId;
  const now = new Date('2026-08-03T12:00:00.000Z');
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query('SET CONSTRAINTS ALL DEFERRED');
    await queryRunner.query(
      `INSERT INTO accounts
       (id, user_id, normalized_email, password_hash, password_hash_algorithm,
        password_hash_parameters, created_at, updated_at)
     VALUES ($1, $2, $3, 'synthetic-hash', 'scrypt', '{}', $4, $4)`,
      [accountId, userId, `${userId}@example.test`, now],
    );
    await queryRunner.query(
      `INSERT INTO users (id, account_id, created_at, updated_at)
     VALUES ($1, $2, $3, $3)`,
      [userId, accountId, now],
    );
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
};

interface AccessGraphOverrides {
  readonly warehouse?: WarehouseFixture;
  readonly customRoles?: readonly RoleFixture[];
}

export const persistWarehouseAccessGraph = async (
  dataSource: DataSource,
  overrides: AccessGraphOverrides = {},
) => {
  const warehouse = overrides.warehouse ?? buildWarehouse();
  const managerRole = buildRole({
    warehouseId: warehouse.id,
    name: 'Warehouse Manager',
    kind: 'warehouse_manager',
    permissionIds: ['ROLES:WATCH'],
  });
  const customRoles = (overrides.customRoles ?? [buildRole()]).map((role) => ({
    ...role,
    warehouseId: warehouse.id,
    kind: 'custom' as const,
  }));
  const manager = buildWarehouseMembership({
    warehouseId: warehouse.id,
    roleId: managerRole.id,
    roleKind: managerRole.kind,
  });
  const members = customRoles.map((role) =>
    buildWarehouseMembership({
      warehouseId: warehouse.id,
      roleId: role.id,
      roleKind: role.kind,
    }),
  );

  await Promise.all(
    [manager, ...members].map((member) =>
      insertIdentity(dataSource, member.userId),
    ),
  );
  await dataSource.query('INSERT INTO warehouses (id, name) VALUES ($1, $2)', [
    warehouse.id,
    warehouse.name,
  ]);
  for (const role of [managerRole, ...customRoles]) {
    await dataSource.query(
      'INSERT INTO roles (id, warehouse_id, name, kind) VALUES ($1, $2, $3, $4)',
      [role.id, role.warehouseId, role.name, role.kind],
    );
    for (const permissionId of role.permissionIds) {
      const permission = await dataSource.query<{ kind: string }[]>(
        'SELECT kind FROM permissions WHERE id = $1',
        [permissionId],
      );
      await dataSource.query(
        `INSERT INTO role_permissions
           (role_id, permission_id, role_kind, permission_kind)
         VALUES ($1, $2, $3, $4)`,
        [role.id, permissionId, role.kind, permission[0].kind],
      );
    }
  }
  for (const member of [manager, ...members]) {
    await dataSource.query(
      `INSERT INTO warehouse_memberships
         (user_id, warehouse_id, role_id, role_kind)
       VALUES ($1, $2, $3, $4)`,
      [member.userId, member.warehouseId, member.roleId, member.roleKind],
    );
  }
  return { warehouse, managerRole, customRoles, manager, members };
};
