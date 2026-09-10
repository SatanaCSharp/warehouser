import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service.js';
import { RoleEntity } from 'shared/domain/entities/role.entity.js';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity.js';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity.js';
import { DataSource, In } from 'typeorm';

@Injectable()
export class ManagerTransferRepository {
  constructor(private readonly dataSource: DataSource) {}

  lockWarehouse(warehouseId: string): Promise<WarehouseEntity | null> {
    const manager = getEntityManager(this.dataSource);
    return manager
      .getRepository(WarehouseEntity)
      .createQueryBuilder('warehouse')
      .where('warehouse.id = :warehouseId', { warehouseId })
      .setLock('pessimistic_write')
      .getOne();
  }

  lockReplacementRole(
    warehouseId: string,
    roleId: string,
  ): Promise<RoleEntity | null> {
    const manager = getEntityManager(this.dataSource);
    return manager
      .getRepository(RoleEntity)
      .createQueryBuilder('role')
      .where({ id: roleId, warehouseId, kind: 'custom' })
      .setLock('pessimistic_write')
      .getOne();
  }

  lockMembers(
    warehouseId: string,
    userIds: readonly string[],
  ): Promise<WarehouseMembershipEntity[]> {
    const manager = getEntityManager(this.dataSource);
    return manager
      .getRepository(WarehouseMembershipEntity)
      .createQueryBuilder('membership')
      .where({ warehouseId, userId: In([...userIds]) })
      .orderBy('membership.userId', 'ASC')
      .setLock('pessimistic_write')
      .getMany();
  }

  async assignRole(
    warehouseId: string,
    userId: string,
    roleId: string,
    roleKind: 'custom' | 'warehouse_manager',
  ): Promise<boolean> {
    const manager = getEntityManager(this.dataSource);

    const updated = await manager
      .getRepository(WarehouseMembershipEntity)
      .update(
        { warehouseId, userId },
        { roleId, roleKind, updatedAt: new Date() },
      );

    return updated.affected === 1;
  }
}
