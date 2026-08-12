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

  /** Resolves the actor's own membership projection. Callers that already operate inside one named
   * Warehouse (the T26 `current` read) pass `warehouseId` so the membership and its archived state
   * are scoped to that Warehouse rather than resolved ambiguously (AC-03a, AC-12a). */
  async resolveCurrentAccess(
    userId: string,
    warehouseId?: string,
  ): Promise<CurrentAccessPersistenceResult | null> {
    const manager = getEntityManager(this.dataSource);
    const membership = await manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy(warehouseId ? { userId, warehouseId } : { userId });

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
