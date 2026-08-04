import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { DataSource } from 'typeorm';

export interface AccessPrincipalPersistenceResult {
  readonly userId: string;
  readonly warehouseId: string;
  readonly roleId: string;
  readonly roleKind: 'custom' | 'warehouse_manager';
  readonly granted: boolean;
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
}
