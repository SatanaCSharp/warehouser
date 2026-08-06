import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { DataSource } from 'typeorm';

export interface MembershipWrite {
  readonly userId: string;
  readonly warehouseId: string;
  readonly roleId: string;
  readonly roleKind: 'custom';
}

@Injectable()
export class MemberLifecycleRepository {
  constructor(private readonly dataSource: DataSource) {}

  // Same Warehouse-level lock `ManagerTransferRepository.lockWarehouse` takes
  // first (AC-15): `DeleteMemberCommand` acquires it before the target's
  // membership row, so a racing deletion always serializes against a
  // concurrent manager transfer at the Warehouse level rather than only at
  // the final membership row, matching the spec's "transfer completes, the
  // racing deletion is refused" outcome.
  lockWarehouse(warehouseId: string): Promise<WarehouseEntity | null> {
    const manager = getEntityManager(this.dataSource);
    return manager
      .getRepository(WarehouseEntity)
      .createQueryBuilder('warehouse')
      .where('warehouse.id = :warehouseId', { warehouseId })
      .setLock('pessimistic_write')
      .getOne();
  }

  lockMembership(
    warehouseId: string,
    userId: string,
  ): Promise<WarehouseMembershipEntity | null> {
    const manager = getEntityManager(this.dataSource);
    return manager
      .getRepository(WarehouseMembershipEntity)
      .createQueryBuilder('membership')
      .where({ warehouseId, userId })
      .setLock('pessimistic_write')
      .getOne();
  }

  async findRoleGrantedPermissionIds(roleId: string): Promise<string[]> {
    const manager = getEntityManager(this.dataSource);
    const grants = await manager
      .getRepository(RolePermissionEntity)
      .find({ where: { roleId }, select: { permissionId: true } });
    return grants.map((grant) => grant.permissionId);
  }

  async insertMembership(input: MembershipWrite): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    await manager.getRepository(WarehouseMembershipEntity).insert({
      userId: input.userId,
      warehouseId: input.warehouseId,
      roleId: input.roleId,
      roleKind: input.roleKind,
    });
  }

  async deleteMembership(warehouseId: string, userId: string): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    await manager
      .getRepository(WarehouseMembershipEntity)
      .delete({ warehouseId, userId });
  }
}
