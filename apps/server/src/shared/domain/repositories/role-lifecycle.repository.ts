import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { DataSource, In } from 'typeorm';

export interface CustomRoleWrite {
  readonly id: string;
  readonly warehouseId: string;
  readonly name: string;
}

const permissionRows = (
  roleId: string,
  permissions: readonly PermissionEntity[],
) =>
  permissions.map((permission) => ({
    roleId,
    permissionId: permission.id,
    roleKind: 'custom' as const,
    permissionKind: permission.kind,
  }));

@Injectable()
export class RoleLifecycleRepository {
  constructor(private readonly dataSource: DataSource) {}

  async createCustomRole(
    input: CustomRoleWrite,
    permissions: readonly PermissionEntity[],
  ): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    await manager.getRepository(RoleEntity).insert({
      id: input.id,
      warehouseId: input.warehouseId,
      name: input.name,
      kind: 'custom',
    });
    const grants = permissionRows(input.id, permissions);
    if (grants.length > 0) {
      await manager.getRepository(RolePermissionEntity).insert(grants);
    }
  }

  findAssignablePermissions(
    permissionIds: readonly string[],
  ): Promise<PermissionEntity[]> {
    const manager = getEntityManager(this.dataSource);
    if (permissionIds.length === 0) {
      return Promise.resolve([]);
    }
    return manager.getRepository(PermissionEntity).find({
      where: { id: In([...permissionIds]), kind: 'assignable' },
      order: { id: 'ASC' },
    });
  }

  findRoleByName(
    warehouseId: string,
    name: string,
  ): Promise<RoleEntity | null> {
    const manager = getEntityManager(this.dataSource);
    return manager.getRepository(RoleEntity).findOneBy({ warehouseId, name });
  }

  async updateCustomRole(roleId: string, name: string): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    await manager
      .getRepository(RoleEntity)
      .update({ id: roleId, kind: 'custom' }, { name, updatedAt: new Date() });
  }

  async replaceCustomRolePermissions(
    roleId: string,
    permissions: readonly PermissionEntity[],
  ): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    await manager.getRepository(RolePermissionEntity).delete({ roleId });
    const grants = permissionRows(roleId, permissions);

    if (grants.length) {
      await manager.getRepository(RolePermissionEntity).insert(grants);
    }
  }

  findMemberRole(
    warehouseId: string,
    userId: string,
  ): Promise<WarehouseMembershipEntity | null> {
    const manager = getEntityManager(this.dataSource);
    return manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy({ warehouseId, userId });
  }

  findCustomRole(
    warehouseId: string,
    roleId: string,
  ): Promise<RoleEntity | null> {
    const manager = getEntityManager(this.dataSource);
    return manager
      .getRepository(RoleEntity)
      .findOneBy({ warehouseId, id: roleId, kind: 'custom' });
  }

  async updateMemberRole(
    warehouseId: string,
    userId: string,
    roleId: string,
  ): Promise<boolean> {
    const manager = getEntityManager(this.dataSource);
    const updated = await manager
      .getRepository(WarehouseMembershipEntity)
      .update(
        { userId, warehouseId, roleKind: 'custom' },
        { roleId, roleKind: 'custom', updatedAt: new Date() },
      );
    return updated.affected === 1;
  }

  countRoleMembers(warehouseId: string, roleId: string): Promise<number> {
    const manager = getEntityManager(this.dataSource);
    return manager
      .getRepository(WarehouseMembershipEntity)
      .countBy({ warehouseId, roleId });
  }

  async replaceRoleAssignments(
    warehouseId: string,
    sourceRoleId: string,
    replacementRoleId: string,
  ): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    await manager.getRepository(WarehouseMembershipEntity).update(
      { warehouseId, roleId: sourceRoleId },
      {
        roleId: replacementRoleId,
        roleKind: 'custom',
        updatedAt: new Date(),
      },
    );
  }

  async removeCustomRole(warehouseId: string, roleId: string): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    await manager
      .getRepository(RoleEntity)
      .delete({ warehouseId, id: roleId, kind: 'custom' });
  }

  lockWarehouse(warehouseId: string): Promise<WarehouseEntity | null> {
    const manager = getEntityManager(this.dataSource);
    return manager
      .getRepository(WarehouseEntity)
      .createQueryBuilder('warehouse')
      .where({ id: warehouseId })
      .setLock('pessimistic_write')
      .getOne();
  }

  lockCustomRole(warehouseId: string, id: string): Promise<RoleEntity | null> {
    const manager = getEntityManager(this.dataSource);
    return manager
      .getRepository(RoleEntity)
      .createQueryBuilder('role')
      .where({ id, warehouseId, kind: 'custom' })
      .setLock('pessimistic_write')
      .getOne();
  }

  // Kind-agnostic lock: unlike `lockCustomRole`, this matches a Role of any
  // `kind` (including the reserved `warehouse_manager` kind) scoped to the
  // Warehouse, so a caller can distinguish "missing/cross-Warehouse Role"
  // from "Role exists but is reserved" instead of both collapsing to null.
  lockRoleById(warehouseId: string, id: string): Promise<RoleEntity | null> {
    const manager = getEntityManager(this.dataSource);
    return manager
      .getRepository(RoleEntity)
      .createQueryBuilder('role')
      .where({ id, warehouseId })
      .setLock('pessimistic_write')
      .getOne();
  }
}
