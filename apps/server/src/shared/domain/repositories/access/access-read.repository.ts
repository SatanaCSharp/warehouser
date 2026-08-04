import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { DataSource } from 'typeorm';

export interface AccessRoleRead {
  readonly id: string;
  readonly warehouseId: string;
  readonly name: string;
  readonly kind: 'custom' | 'warehouse_manager';
  readonly permissionIds: readonly string[];
}

export interface AccessMemberRead {
  readonly userId: string;
  readonly warehouseId: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly roleKind: 'custom' | 'warehouse_manager';
}

export interface AccessPermissionRead {
  readonly id: string;
  readonly label: string;
  readonly kind: 'assignable' | 'reserved';
}

@Injectable()
export class AccessReadRepository {
  constructor(private readonly dataSource: DataSource) {}

  listRolesAndPermissions(
    warehouseId: string,
    limit: number,
    after?: string,
    before?: string,
  ): Promise<AccessRoleRead[]> {
    return getEntityManager(this.dataSource).query(
      `SELECT role.id,
              role.warehouse_id AS "warehouseId",
              role.name,
              role.kind,
              COALESCE(array_agg(grant_row.permission_id ORDER BY grant_row.permission_id)
                FILTER (WHERE grant_row.permission_id IS NOT NULL), '{}') AS "permissionIds"
         FROM roles role
         LEFT JOIN role_permissions grant_row ON grant_row.role_id = role.id
        WHERE role.warehouse_id = $1
          AND ($3::uuid IS NULL OR role.id > $3)
          AND ($4::uuid IS NULL OR role.id < $4)
        GROUP BY role.id
        ORDER BY role.name COLLATE "C", role.id
        LIMIT $2`,
      [warehouseId, limit, after ?? null, before ?? null],
    );
  }

  listPermissions(
    limit: number,
    after?: string,
    before?: string,
  ): Promise<AccessPermissionRead[]> {
    return getEntityManager(this.dataSource).query(
      `SELECT id, label, kind
         FROM permissions
        WHERE ($2::varchar IS NULL OR id > $2)
          AND ($3::varchar IS NULL OR id < $3)
        ORDER BY kind, id
        LIMIT $1`,
      [limit, after ?? null, before ?? null],
    );
  }

  listMembersAndAssignments(
    warehouseId: string,
    limit: number,
    after?: string,
    before?: string,
  ): Promise<AccessMemberRead[]> {
    return getEntityManager(this.dataSource).query(
      `SELECT membership.user_id AS "userId",
              membership.warehouse_id AS "warehouseId",
              membership.role_id AS "roleId",
              role.name AS "roleName",
              membership.role_kind AS "roleKind"
         FROM warehouse_memberships membership
         JOIN roles role
           ON role.id = membership.role_id
          AND role.warehouse_id = membership.warehouse_id
        WHERE membership.warehouse_id = $1
          AND ($3::uuid IS NULL OR membership.user_id > $3)
          AND ($4::uuid IS NULL OR membership.user_id < $4)
        ORDER BY membership.user_id
        LIMIT $2`,
      [warehouseId, limit, after ?? null, before ?? null],
    );
  }
}
