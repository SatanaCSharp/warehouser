import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { DataSource } from 'typeorm';

export interface AssignableRoleProjection {
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

  // Resolves the owning Workspace of a Warehouse without locking it, so a
  // read path can tell "a Warehouse of another Workspace" apart from "a
  // Warehouse of mine that has no assignable Role" before it projects
  // anything. `readAssignableRoles` cannot make that distinction on its own:
  // both collapse to an empty rowset (AC-23a).
  async findWarehouseWorkspaceId(warehouseId: string): Promise<string | null> {
    const manager = getEntityManager(this.dataSource);

    const warehouse = await manager
      .getRepository(WarehouseEntity)
      .createQueryBuilder('warehouse')
      .select('warehouse.workspaceId', 'workspaceId')
      .where('warehouse.id = :warehouseId', { warehouseId })
      .getRawOne<{ workspaceId: string }>();

    return warehouse?.workspaceId ?? null;
  }

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

  // Kind-agnostic lock scoped to the named Warehouse: matches a Role of any
  // `kind` (including the reserved `warehouse_manager` kind), so a caller can
  // distinguish "missing/cross-Warehouse Role" from "Role exists but is
  // reserved" instead of both collapsing to `null` (AC-25).
  lockRole(warehouseId: string, roleId: string): Promise<RoleEntity | null> {
    const manager = getEntityManager(this.dataSource);

    return manager
      .getRepository(RoleEntity)
      .createQueryBuilder('role')
      .where({ id: roleId, warehouseId })
      .setLock('pessimistic_write')
      .getOne();
  }

  // The composite primary key (`userId`, `warehouseId`) resolves at most one
  // row, used both to refuse a duplicate grant (AC-25) and to locate the
  // membership a revocation targets (AC-25b/AC-25c/AC-25d).
  lockMembership(
    userId: string,
    warehouseId: string,
  ): Promise<WarehouseMembershipEntity | null> {
    const manager = getEntityManager(this.dataSource);

    return manager
      .getRepository(WarehouseMembershipEntity)
      .createQueryBuilder('membership')
      .where({ userId, warehouseId })
      .setLock('pessimistic_write')
      .getOne();
  }
}
