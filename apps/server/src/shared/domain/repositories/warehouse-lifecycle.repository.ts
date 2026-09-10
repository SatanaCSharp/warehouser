import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service.js';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity.js';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity.js';
import { DataSource } from 'typeorm';

interface CreateWarehouseInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
}

interface WarehouseDeliveryAddressInput {
  readonly addressText: string;
  readonly accessNotes: string | null;
}

@Injectable()
export class WarehouseLifecycleRepository {
  constructor(private readonly dataSource: DataSource) {}

  async createWarehouse(input: CreateWarehouseInput): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    const now = new Date();

    await manager.getRepository(WarehouseEntity).insert({
      id: input.id,
      workspaceId: input.workspaceId,
      name: input.name,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  findWarehouse(warehouseId: string): Promise<WarehouseEntity | null> {
    const manager = getEntityManager(this.dataSource);

    return manager.getRepository(WarehouseEntity).findOneBy({
      id: warehouseId,
    });
  }

  lockWarehouse(warehouseId: string): Promise<WarehouseEntity | null> {
    const manager = getEntityManager(this.dataSource);

    return manager
      .getRepository(WarehouseEntity)
      .createQueryBuilder('warehouse')
      .where('warehouse.id = :warehouseId', { warehouseId })
      .setLock('pessimistic_write')
      .getOne();
  }

  async renameWarehouse(warehouseId: string, name: string): Promise<void> {
    const manager = getEntityManager(this.dataSource);

    await manager
      .getRepository(WarehouseEntity)
      .update({ id: warehouseId }, { name, updatedAt: new Date() });
  }

  // AC-10 — one single-row update that both records and corrects the
  // Warehouse's own Delivery Address. Notes and address move together, so a
  // correction can never leave notes standing against an address that is no
  // longer there (`chk_warehouses_delivery_notes_require_address`).
  async setDeliveryAddress(
    warehouseId: string,
    input: WarehouseDeliveryAddressInput,
  ): Promise<void> {
    const manager = getEntityManager(this.dataSource);

    await manager.getRepository(WarehouseEntity).update(
      { id: warehouseId },
      {
        deliveryAddressText: input.addressText,
        deliveryAccessNotes: input.accessNotes,
        updatedAt: new Date(),
      },
    );
  }

  async setArchivedAt(
    warehouseId: string,
    archivedAt: Date | null,
  ): Promise<void> {
    const manager = getEntityManager(this.dataSource);

    await manager
      .getRepository(WarehouseEntity)
      .update({ id: warehouseId }, { archivedAt, updatedAt: new Date() });
  }

  async lockWorkspaceAndCountNonArchivedWarehouses(
    workspaceId: string,
  ): Promise<number> {
    const manager = getEntityManager(this.dataSource);

    await manager
      .getRepository(WorkspaceEntity)
      .createQueryBuilder('workspace')
      .where('workspace.id = :workspaceId', { workspaceId })
      .setLock('pessimistic_write')
      .getOne();

    return manager
      .getRepository(WarehouseEntity)
      .createQueryBuilder('warehouse')
      .where('warehouse.workspaceId = :workspaceId', { workspaceId })
      .andWhere('warehouse.archivedAt IS NULL')
      .getCount();
  }
}
