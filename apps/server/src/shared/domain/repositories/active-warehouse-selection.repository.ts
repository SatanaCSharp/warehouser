import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { DataSource } from 'typeorm';

export interface ActiveWarehouseMembershipLock {
  readonly archivedAt: Date | null;
}

@Injectable()
export class ActiveWarehouseSelectionRepository {
  constructor(private readonly dataSource: DataSource) {}

  // Locks the (userId, warehouseId) `warehouse_memberships` row together
  // with that Warehouse's `archived_at` (data-model.md "Constraints
  // deliberately not expressed in the schema" — "The Active Warehouse is
  // not archived"), inside the caller's `@Transactional()` boundary, so the
  // command can decide under lock whether the selection is allowed before
  // writing it. Returns `null` when the actor holds no membership in that
  // Warehouse at all (AC-04).
  //
  // Lock order: the `warehouses` row first, then the membership row
  // (data-model.md "Lock order" — "Warehouse-level commands keep the
  // approved order and lock the `warehouses` row first"), matching every
  // sibling Warehouse-level command and avoiding a `40P01` deadlock against
  // a concurrent membership-revoking or Manager-transfer command that also
  // takes both locks in that order.
  async lockMembershipForSelection(
    userId: string,
    warehouseId: string,
  ): Promise<ActiveWarehouseMembershipLock | null> {
    const manager = getEntityManager(this.dataSource);

    const warehouse = await manager
      .getRepository(WarehouseEntity)
      .createQueryBuilder('warehouse')
      .where('warehouse.id = :warehouseId', { warehouseId })
      .setLock('pessimistic_write')
      .getOne();

    const membership = await manager
      .getRepository(WarehouseMembershipEntity)
      .createQueryBuilder('membership')
      .where('membership.userId = :userId', { userId })
      .andWhere('membership.warehouseId = :warehouseId', { warehouseId })
      .setLock('pessimistic_write')
      .getOne();
    if (!membership) {
      return null;
    }

    return { archivedAt: warehouse?.archivedAt ?? null };
  }

  // Stores the selection against the member rather than the device (AC-03),
  // so it is the same wherever they next sign in and persists until
  // changed.
  async setActiveWarehouse(userId: string, warehouseId: string): Promise<void> {
    const manager = getEntityManager(this.dataSource);

    await manager
      .getRepository(UserEntity)
      .update(
        { id: userId },
        { activeWarehouseId: warehouseId, updatedAt: new Date() },
      );
  }
}
