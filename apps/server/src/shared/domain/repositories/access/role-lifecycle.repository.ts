import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { DataSource } from 'typeorm';

@Injectable()
export class RoleLifecycleRepository {
  constructor(private readonly dataSource: DataSource) {}

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
