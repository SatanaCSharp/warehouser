import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import type { PermissionEntityKind } from 'shared/domain/entities/permission.entity';
import type { RoleEntityKind } from 'shared/domain/entities/role.entity';
import { DataSource } from 'typeorm';

export interface WarehousePersistenceInput {
  readonly id: string;
  readonly name: string;
}

export interface RolePersistenceInput {
  readonly id: string;
  readonly warehouseId: string;
  readonly name: string;
  readonly kind: RoleEntityKind;
}

export interface MembershipPersistenceInput {
  readonly userId: string;
  readonly warehouseId: string;
  readonly roleId: string;
  readonly roleKind: RoleEntityKind;
}

export interface InitialAccessPersistenceInput {
  readonly warehouse: WarehousePersistenceInput;
  readonly managerRole: RolePersistenceInput;
  readonly managerMembership: MembershipPersistenceInput;
  readonly permissionIds: readonly string[];
}

interface PermissionRow {
  readonly id: string;
  readonly kind: PermissionEntityKind;
}

@Injectable()
export class AccessProvisioningRepository {
  constructor(private readonly dataSource: DataSource) {}

  async provisionInitialAccess(
    input: InitialAccessPersistenceInput,
  ): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    const permissions = await manager.query<PermissionRow[]>(
      'SELECT id, kind FROM permissions WHERE id = ANY($1::varchar[]) ORDER BY id',
      [[...input.permissionIds]],
    );
    if (permissions.length !== input.permissionIds.length) {
      throw new Error('Required access Permission is missing');
    }

    await manager.query('INSERT INTO warehouses (id, name) VALUES ($1, $2)', [
      input.warehouse.id,
      input.warehouse.name,
    ]);
    await manager.query(
      `INSERT INTO roles (id, warehouse_id, name, kind)
       VALUES ($1, $2, $3, $4)`,
      [
        input.managerRole.id,
        input.managerRole.warehouseId,
        input.managerRole.name,
        input.managerRole.kind,
      ],
    );
    await manager.query(
      `INSERT INTO role_permissions
         (role_id, permission_id, role_kind, permission_kind)
       SELECT $1, permission.id, $2, permission.kind
         FROM permissions permission
        WHERE permission.id = ANY($3::varchar[])`,
      [input.managerRole.id, input.managerRole.kind, [...input.permissionIds]],
    );
    await manager.query(
      `INSERT INTO warehouse_memberships
         (user_id, warehouse_id, role_id, role_kind)
       VALUES ($1, $2, $3, $4)`,
      [
        input.managerMembership.userId,
        input.managerMembership.warehouseId,
        input.managerMembership.roleId,
        input.managerMembership.roleKind,
      ],
    );
  }
}
