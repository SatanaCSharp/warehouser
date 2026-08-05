import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
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
export interface CurrentAccessPersistenceResult {
  readonly warehouseId: string;
  readonly roleId: string;
  readonly roleKind: 'custom' | 'warehouse_manager';
  readonly permissionIds: readonly string[];
}

@Injectable()
export class AccessCurrentUserRepository {
  constructor(private readonly dataSource: DataSource) {}

  async resolveRequiredPermission(
    userId: string,
    permissionId: string,
  ): Promise<AccessCurrentUserPersistenceResult | null> {
    const manager = getEntityManager(this.dataSource);
    const membership = await manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy({ userId });
    if (!membership) {
      return null;
    }
    const granted = await manager
      .getRepository(RolePermissionEntity)
      .existsBy({ roleId: membership.roleId, permissionId });
    return { ...membership, permissionId, granted };
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

  async resolveCurrentAccess(
    userId: string,
  ): Promise<CurrentAccessPersistenceResult | null> {
    const manager = getEntityManager(this.dataSource);
    const membership = await manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy({ userId });

    if (!membership) {
      return null;
    }

    const grants = await manager.getRepository(RolePermissionEntity).find({
      select: { permissionId: true },
      where: { roleId: membership.roleId },
      order: { permissionId: 'ASC' },
    });

    return {
      warehouseId: membership.warehouseId,
      roleId: membership.roleId,
      roleKind: membership.roleKind,
      permissionIds: grants.map((grant) => grant.permissionId),
    };
  }
}
