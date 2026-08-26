import type { ItemWithOnHandAndLatestReasonRead } from 'shared/domain/repositories/item-catalogue.repository';

export interface ItemLatestAdjustmentRead {
  readonly countedQuantity: number;
  readonly reason: string;
  readonly adjustedAt: Date;
}

export interface ItemCatalogueEntryRead {
  readonly id: string;
  readonly sku: string;
  readonly description: string;
  readonly unitOfMeasure: string;
  readonly onHandQuantity: number;
  readonly deactivatedAt: Date | null;
  readonly latestAdjustment: ItemLatestAdjustmentRead | null;
  readonly createdAt: Date;
}

// The shared persistence row `ItemCatalogueRepository.findItemsWithOnHandAndLatestReason` produces
// carries the latest adjustment as three separate columns (one per correlated subquery); this
// mapper is the one place that assembles them into openapi.yaml `Item`'s nested `latestAdjustment`
// object, above the repository boundary (server-architecture.md, "feature mappers translate
// between domain and persistence models").
export const toItemCatalogueEntry = (
  row: ItemWithOnHandAndLatestReasonRead,
): ItemCatalogueEntryRead => ({
  id: row.id,
  sku: row.sku,
  description: row.description,
  unitOfMeasure: row.unitOfMeasure,
  onHandQuantity: row.onHandQuantity,
  deactivatedAt: row.deactivatedAt,
  latestAdjustment:
    row.latestAdjustmentReason !== null &&
    row.latestAdjustmentQuantity !== null &&
    row.latestAdjustedAt !== null
      ? {
          countedQuantity: row.latestAdjustmentQuantity,
          reason: row.latestAdjustmentReason,
          adjustedAt: row.latestAdjustedAt,
        }
      : null,
  createdAt: row.createdAt,
});
