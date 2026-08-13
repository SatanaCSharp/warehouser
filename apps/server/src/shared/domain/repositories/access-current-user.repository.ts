import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { DataSource, In } from 'typeorm';

export interface AccessCurrentUserPersistenceResult {
  readonly userId: string;
  readonly warehouseId: string;
  readonly roleId: string;
  readonly roleKind: 'custom' | 'warehouse_manager';
  readonly granted: boolean;
  readonly permissionId: string;
}

export interface AccessCurrentUserWithWarehousePersistenceResult extends AccessCurrentUserPersistenceResult {
  readonly archivedAt: Date | null;
}
export interface CurrentAccessPersistenceResult {
  readonly warehouseId: string;
  readonly roleId: string;
  readonly roleKind: 'custom' | 'warehouse_manager';
  readonly permissionIds: readonly string[];
  readonly archivedAt: Date | null;
}

@Injectable()
export class AccessCurrentUserRepository {
  constructor(private readonly dataSource: DataSource) {}

  async resolveRequiredPermission(
    userId: string,
    warehouseId: string,
    permissionId: string,
  ): Promise<AccessCurrentUserWithWarehousePersistenceResult | null> {
    const manager = getEntityManager(this.dataSource);
    const membership = await manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy({ userId, warehouseId });
    if (!membership) {
      return null;
    }
    const granted = await manager
      .getRepository(RolePermissionEntity)
      .existsBy({ roleId: membership.roleId, permissionId });
    const warehouse = await manager
      .getRepository(WarehouseEntity)
      .findOneBy({ id: warehouseId });
    return {
      ...membership,
      permissionId,
      granted,
      archivedAt: warehouse ? warehouse.archivedAt : null,
    };
  }

  async resolveAnyRequiredPermission(
    userId: string,
    permissionIds: readonly string[],
  ): Promise<AccessCurrentUserPersistenceResult | null> {
    const manager = getEntityManager(this.dataSource);
    const membership = await manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy({ userId });
    if (!membership || permissionIds.length === 0) {
      return null;
    }
    const grants = await manager.getRepository(RolePermissionEntity).find({
      select: { permissionId: true },
      where: {
        roleId: membership.roleId,
        permissionId: In([...permissionIds]),
      },
    });
    const grantedIds = new Set(grants.map((grant) => grant.permissionId));
    const permissionId = permissionIds.find((candidate) =>
      grantedIds.has(candidate),
    );
    return permissionId ? { ...membership, permissionId, granted: true } : null;
  }

  /** Resolves the actor's own membership projection inside one named Warehouse, so the membership
   * and its archived state are scoped to that Warehouse (AC-03a, AC-12a).
   *
   * `warehouseId` is required, not optional. A User legitimately holds a membership in several
   * Warehouses (AC-23), each with its own Role and therefore its own Permissions, so there is no
   * such thing as "the" membership of a User: an unqualified lookup resolves through the
   * `(user_id, warehouse_id)` key and returns whichever row sorts first. Every caller uses this
   * projection as the actor's Permission ceiling, so an arbitrary pick lets a Role held in one
   * Warehouse authorize an action in another (AC-05). Making the argument mandatory is what stops
   * a future caller from reintroducing that. */
  async resolveCurrentAccess(
    userId: string,
    warehouseId: string,
  ): Promise<CurrentAccessPersistenceResult | null> {
    const manager = getEntityManager(this.dataSource);
    const membership = await manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy({ userId, warehouseId });

    if (!membership) {
      return null;
    }

    const grants = await manager.getRepository(RolePermissionEntity).find({
      select: { permissionId: true },
      where: { roleId: membership.roleId },
      order: { permissionId: 'ASC' },
    });
    const warehouse = await manager
      .getRepository(WarehouseEntity)
      .findOneBy({ id: membership.warehouseId });

    return {
      warehouseId: membership.warehouseId,
      roleId: membership.roleId,
      roleKind: membership.roleKind,
      permissionIds: grants.map((grant) => grant.permissionId),
      archivedAt: warehouse ? warehouse.archivedAt : null,
    };
  }
}
