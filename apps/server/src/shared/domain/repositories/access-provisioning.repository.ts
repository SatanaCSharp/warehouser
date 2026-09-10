import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service.js';
import { PermissionEntity } from 'shared/domain/entities/permission.entity.js';
import type { RoleEntityKind } from 'shared/domain/entities/role.entity.js';
import { RoleEntity } from 'shared/domain/entities/role.entity.js';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity.js';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity.js';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity.js';
import { DataSource, In } from 'typeorm';

export interface RolePersistenceInput {
  readonly id: string;
  readonly warehouseId: string;
  readonly name: string;
  readonly kind: RoleEntityKind;
}
export interface InitialAccessPersistenceInput {
  readonly warehouseId: string;
  readonly userId: string;
  readonly managerRole: RolePersistenceInput;
  readonly permissionIds: readonly string[];
}

@Injectable()
export class AccessProvisioningRepository {
  constructor(private readonly dataSource: DataSource) {}

  async provisionInitialAccess(
    input: InitialAccessPersistenceInput,
  ): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    const permissions = await manager.getRepository(PermissionEntity).find({
      select: { id: true, kind: true },
      where: { id: In([...input.permissionIds]) },
      order: { id: 'ASC' },
    });
    const warehouse = await manager
      .getRepository(WarehouseEntity)
      .findOneByOrFail({ id: input.warehouseId });
    await manager.getRepository(RoleEntity).insert(input.managerRole);
    await manager.getRepository(RolePermissionEntity).insert(
      permissions.map((permission) => ({
        roleId: input.managerRole.id,
        permissionId: permission.id,
        roleKind: input.managerRole.kind,
        permissionKind: permission.kind,
      })),
    );
    await manager.getRepository(WarehouseMembershipEntity).insert({
      userId: input.userId,
      warehouseId: input.warehouseId,
      workspaceId: warehouse.workspaceId,
      roleId: input.managerRole.id,
      roleKind: input.managerRole.kind,
    });
  }
}
