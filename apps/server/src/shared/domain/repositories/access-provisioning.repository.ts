import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import type { RoleEntityKind } from 'shared/domain/entities/role.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { DataSource, In } from 'typeorm';

export interface WarehousePersistenceInput {
  readonly id: string;
  readonly name: string;
}
export interface RolePersistenceInput {
  readonly id: string;
  readonly warehouseId: string;
  readonly name: string;
  readonly kind: RoleEntityKind;
}
export interface MembershipPersistenceInput {
  readonly userId: string;
  readonly warehouseId: string;
  readonly roleId: string;
  readonly roleKind: RoleEntityKind;
}
export interface InitialAccessPersistenceInput {
  readonly warehouse: WarehousePersistenceInput;
  readonly managerRole: RolePersistenceInput;
  readonly managerMembership: MembershipPersistenceInput;
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
    await manager.getRepository(WarehouseEntity).insert(input.warehouse);
    await manager.getRepository(RoleEntity).insert(input.managerRole);
    await manager.getRepository(RolePermissionEntity).insert(
      permissions.map((permission) => ({
        roleId: input.managerRole.id,
        permissionId: permission.id,
        roleKind: input.managerRole.kind,
        permissionKind: permission.kind,
      })),
    );
    await manager
      .getRepository(WarehouseMembershipEntity)
      .insert(input.managerMembership);
  }
}
