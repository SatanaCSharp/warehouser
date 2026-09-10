import { Injectable } from '@nestjs/common';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';

export interface WarehouseItemRead {
  readonly id: string;
  readonly sku: string;
  readonly description: string;
  readonly unitOfMeasure: string;
  readonly onHandQuantity: number;
  readonly active: boolean;
  readonly latestAdjustmentReason: string | null;
}

// The acting Warehouse's Items with their on-hand figure and latest adjustment reason (AC-08's
// consolidated-figure read).
@Injectable()
export class ListWarehouseItemsQuery {
  constructor(
    private readonly itemCatalogueRepository: ItemCatalogueRepository,
  ) {}

  async execute(currentUser: AccessCurrentUser): Promise<WarehouseItemRead[]> {
    const rows =
      await this.itemCatalogueRepository.findItemsWithOnHandAndLatestReason(
        currentUser.warehouseId,
      );

    return rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      description: row.description,
      unitOfMeasure: row.unitOfMeasure,
      onHandQuantity: row.onHandQuantity,
      active: row.deactivatedAt === null,
      latestAdjustmentReason: row.latestAdjustmentReason,
    }));
  }
}
