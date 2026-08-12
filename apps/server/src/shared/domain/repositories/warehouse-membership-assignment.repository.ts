import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { DataSource } from 'typeorm';

interface AssignableRoleProjection {
  readonly id: string;
  readonly name: string;
}

interface InsertMembershipInput {
  readonly userId: string;
  readonly warehouseId: string;
  readonly workspaceId: string;
  readonly roleId: string;
  readonly roleKind: 'custom' | 'warehouse_manager';
}

@Injectable()
export class WarehouseMembershipAssignmentRepository {
  constructor(private readonly dataSource: DataSource) {}

  readAssignableRoles(
    warehouseId: string,
    workspaceId: string,
  ): Promise<AssignableRoleProjection[]> {
    const manager = getEntityManager(this.dataSource);

    return manager
      .getRepository(RoleEntity)
      .createQueryBuilder('role')
      .innerJoin(
        WarehouseEntity,
        'warehouse',
        'warehouse.id = role.warehouseId',
      )
      .select('role.id', 'id')
      .addSelect('role.name', 'name')
      .where('role.warehouseId = :warehouseId', { warehouseId })
      .andWhere('warehouse.workspaceId = :workspaceId', { workspaceId })
      .andWhere('role.kind = :kind', { kind: 'custom' })
      .orderBy('role.name', 'ASC')
      .getRawMany<AssignableRoleProjection>();
  }

  async insertMembership(input: InsertMembershipInput): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    const now = new Date();

    await manager.getRepository(WarehouseMembershipEntity).insert({
      userId: input.userId,
      warehouseId: input.warehouseId,
      workspaceId: input.workspaceId,
      roleId: input.roleId,
      roleKind: input.roleKind,
      createdAt: now,
      updatedAt: now,
    });
  }

  async deleteMembership(userId: string, warehouseId: string): Promise<void> {
    const manager = getEntityManager(this.dataSource);

    // `fk_users_active_warehouse` is declared
    // `ON DELETE SET NULL (active_warehouse_id)`, so removing this
    // membership row nulls only the deleted (user, warehouse) pair's
    // `active_warehouse_id` reference; no other User's row is touched.
    await manager
      .getRepository(WarehouseMembershipEntity)
      .delete({ userId, warehouseId });
  }
}
