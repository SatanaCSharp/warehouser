import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { DataSource } from 'typeorm';

export type RoleWriteResult =
  'saved' | 'name-conflict' | 'invalid-permission' | 'role-unavailable';

export interface CustomRoleWrite {
  readonly id: string;
  readonly warehouseId: string;
  readonly name: string;
  readonly permissionIds: readonly string[];
}

const isUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const record = error as Record<string, unknown>;
  if (!Object.keys(record).includes('code')) {
    return false;
  }
  return record.code === '23505';
};

@Injectable()
export class RoleLifecycleRepository {
  constructor(private readonly dataSource: DataSource) {}

  async createCustomRole(input: CustomRoleWrite): Promise<RoleWriteResult> {
    const manager = getEntityManager(this.dataSource);
    const permissions = await manager.query<{ readonly id: string }[]>(
      "SELECT id FROM permissions WHERE kind = 'assignable' AND id = ANY($1::varchar[]) ORDER BY id",
      [[...input.permissionIds]],
    );
    if (permissions.length !== new Set(input.permissionIds).size) {
      return 'invalid-permission';
    }

    try {
      await manager.transaction(async (transaction) => {
        await transaction.query(
          `INSERT INTO roles (id, warehouse_id, name, kind)
           VALUES ($1, $2, $3, 'custom')`,
          [input.id, input.warehouseId, input.name],
        );
        await transaction.query(
          `INSERT INTO role_permissions
             (role_id, permission_id, role_kind, permission_kind)
           SELECT $1, permission.id, 'custom', permission.kind
             FROM permissions permission
            WHERE permission.kind = 'assignable'
              AND permission.id = ANY($2::varchar[])`,
          [input.id, [...input.permissionIds]],
        );
      });
      return 'saved';
    } catch (error) {
      if (isUniqueViolation(error)) {
        return 'name-conflict';
      }
      throw error;
    }
  }

  async updateCustomRole(input: CustomRoleWrite): Promise<RoleWriteResult> {
    const manager = getEntityManager(this.dataSource);
    const permissions = await manager.query<{ readonly id: string }[]>(
      "SELECT id FROM permissions WHERE kind = 'assignable' AND id = ANY($1::varchar[]) ORDER BY id",
      [[...input.permissionIds]],
    );
    if (permissions.length !== new Set(input.permissionIds).size) {
      return 'invalid-permission';
    }

    try {
      return await manager.transaction(async (transaction) => {
        const [, affected] = await transaction.query<[unknown[], number]>(
          `UPDATE roles
              SET name = $3, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND warehouse_id = $2 AND kind = 'custom'`,
          [input.id, input.warehouseId, input.name],
        );
        if (affected !== 1) {
          return 'role-unavailable';
        }

        await transaction.query(
          'DELETE FROM role_permissions WHERE role_id = $1',
          [input.id],
        );
        await transaction.query(
          `INSERT INTO role_permissions
             (role_id, permission_id, role_kind, permission_kind)
           SELECT $1, permission.id, 'custom', permission.kind
             FROM permissions permission
            WHERE permission.kind = 'assignable'
              AND permission.id = ANY($2::varchar[])`,
          [input.id, [...input.permissionIds]],
        );
        return 'saved';
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return 'name-conflict';
      }
      throw error;
    }
  }

  async assignMemberRole(
    warehouseId: string,
    userId: string,
    roleId: string,
  ): Promise<boolean> {
    const [, affected] = await getEntityManager(this.dataSource).query<
      [unknown[], number]
    >(
      `UPDATE warehouse_memberships membership
          SET role_id = role.id,
              role_kind = role.kind,
              updated_at = CURRENT_TIMESTAMP
         FROM roles role
        WHERE membership.user_id = $2
          AND membership.warehouse_id = $1
          AND membership.role_kind <> 'warehouse_manager'
          AND role.id = $3
          AND role.warehouse_id = $1
          AND role.kind = 'custom'`,
      [warehouseId, userId, roleId],
    );

    return affected === 1;
  }

  async replaceAssignedRole(
    warehouseId: string,
    sourceRoleId: string,
    replacementRoleId: string,
  ): Promise<number> {
    const manager = getEntityManager(this.dataSource);
    await manager.query('SELECT id FROM warehouses WHERE id = $1 FOR UPDATE', [
      warehouseId,
    ]);
    const roles = await manager.query<
      { readonly id: string; readonly kind: string }[]
    >(
      `SELECT id, kind FROM roles
        WHERE warehouse_id = $1 AND id = ANY($2::uuid[])
        ORDER BY id FOR UPDATE`,
      [warehouseId, [sourceRoleId, replacementRoleId]],
    );
    if (roles.length !== 2 || roles.some((role) => role.kind !== 'custom')) {
      return 0;
    }

    const [, affected] = await manager.query<[unknown[], number]>(
      `UPDATE warehouse_memberships
          SET role_id = $3, role_kind = 'custom', updated_at = CURRENT_TIMESTAMP
        WHERE warehouse_id = $1 AND role_id = $2`,
      [warehouseId, sourceRoleId, replacementRoleId],
    );
    await manager.query(
      `DELETE FROM roles
        WHERE warehouse_id = $1 AND id = $2 AND kind = 'custom'`,
      [warehouseId, sourceRoleId],
    );
    return affected;
  }
}
