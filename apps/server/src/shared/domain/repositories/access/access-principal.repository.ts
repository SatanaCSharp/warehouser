import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { DataSource } from 'typeorm';

export interface AccessPrincipalPersistenceResult {
  readonly userId: string;
  readonly warehouseId: string;
  readonly roleId: string;
  readonly roleKind: 'custom' | 'warehouse_manager';
  readonly granted: boolean;
  readonly permissionId: string;
}

export interface CurrentAccessPersistenceResult {
  readonly warehouseId: string;
  readonly roleId: string;
  readonly roleKind: 'custom' | 'warehouse_manager';
  readonly permissionIds: readonly string[];
}

@Injectable()
export class AccessPrincipalRepository {
  constructor(private readonly dataSource: DataSource) {}

  async resolveRequiredPermission(
    userId: string,
    permissionId: string,
  ): Promise<AccessPrincipalPersistenceResult | null> {
    const rows = await getEntityManager(this.dataSource).query<
      AccessPrincipalPersistenceResult[]
    >(
      `SELECT membership.user_id AS "userId",
              membership.warehouse_id AS "warehouseId",
              membership.role_id AS "roleId",
              membership.role_kind AS "roleKind",
              $2::varchar AS "permissionId",
              (grant_row.permission_id IS NOT NULL) AS granted
         FROM warehouse_memberships membership
         LEFT JOIN role_permissions grant_row
           ON grant_row.role_id = membership.role_id
          AND grant_row.permission_id = $2
        WHERE membership.user_id = $1`,
      [userId, permissionId],
    );

    return rows[0] ?? null;
  }

  async resolveAnyRequiredPermission(
    userId: string,
    permissionIds: readonly string[],
  ): Promise<AccessPrincipalPersistenceResult | null> {
    const rows = await getEntityManager(this.dataSource).query<
      AccessPrincipalPersistenceResult[]
    >(
      `SELECT membership.user_id AS "userId",
              membership.warehouse_id AS "warehouseId",
              membership.role_id AS "roleId",
              membership.role_kind AS "roleKind",
              requested.permission_id AS "permissionId",
              (grant_row.permission_id IS NOT NULL) AS granted
         FROM warehouse_memberships membership
         CROSS JOIN unnest($2::varchar[]) WITH ORDINALITY requested(permission_id, position)
         LEFT JOIN role_permissions grant_row
           ON grant_row.role_id = membership.role_id
          AND grant_row.permission_id = requested.permission_id
        WHERE membership.user_id = $1
          AND grant_row.permission_id IS NOT NULL
        ORDER BY requested.position
        LIMIT 1`,
      [userId, permissionIds],
    );

    return rows[0] ?? null;
  }

  async resolveCurrentAccess(
    userId: string,
  ): Promise<CurrentAccessPersistenceResult | null> {
    const rows = await getEntityManager(this.dataSource).query<
      CurrentAccessPersistenceResult[]
    >(
      `SELECT membership.warehouse_id AS "warehouseId",
              membership.role_id AS "roleId",
              membership.role_kind AS "roleKind",
              COALESCE(array_agg(grant_row.permission_id ORDER BY grant_row.permission_id)
                FILTER (WHERE grant_row.permission_id IS NOT NULL), '{}') AS "permissionIds"
         FROM warehouse_memberships membership
         LEFT JOIN role_permissions grant_row
           ON grant_row.role_id = membership.role_id
        WHERE membership.user_id = $1
        GROUP BY membership.user_id, membership.warehouse_id,
                 membership.role_id, membership.role_kind`,
      [userId],
    );

    return rows[0] ?? null;
  }
}
