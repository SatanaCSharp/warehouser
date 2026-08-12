import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { DataSource } from 'typeorm';

interface CreateWarehouseInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
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

  async renameWarehouse(warehouseId: string, name: string): Promise<void> {
    const manager = getEntityManager(this.dataSource);

    await manager
      .getRepository(WarehouseEntity)
      .update({ id: warehouseId }, { name, updatedAt: new Date() });
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
