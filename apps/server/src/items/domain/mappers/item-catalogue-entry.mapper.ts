import type { ItemWithOnHandAndLatestReasonRead } from 'shared/domain/repositories/item-catalogue.repository.js';

export interface ItemLatestAdjustmentRead {
  readonly countedQuantity: number;
  readonly reason: string;
  // AC-08 — the member who recorded the count, beside the figure and the reason it was recorded
  // with. The Items table states all three on one line (`24 Aug · cycle count · by you`).
  readonly adjustedByUserId: string;
  readonly adjustedAt: Date;
}

export interface ItemCatalogueEntryRead {
  readonly id: string;
  readonly sku: string;
  readonly description: string;
  readonly unitOfMeasure: string;
  readonly onHandQuantity: number;
  readonly deactivatedAt: Date | null;
  // AC-06c — what names the Item, and therefore whether its SKU is still correctable.
  readonly namingCustomerOrderCount: number;
  readonly namingPurchaseDraftLineCount: number;
  readonly latestAdjustment: ItemLatestAdjustmentRead | null;
  readonly createdAt: Date;
}

// The shared persistence row `ItemCatalogueRepository.findItemsWithOnHandAndLatestReason` produces
// carries the latest adjustment as four separate columns (one per correlated subquery); this
// mapper is the one place that assembles them into openapi.yaml `Item`'s nested `latestAdjustment`
// object, above the repository boundary (server-architecture.md, "feature mappers translate
// between domain and persistence models"). The four are written by one INSERT and read by four
// subqueries over the same single row, so they are all present or all absent — the guard names all
// four rather than trusting any one of them to stand for the rest.
export const toItemCatalogueEntry = (
  row: ItemWithOnHandAndLatestReasonRead,
): ItemCatalogueEntryRead => ({
  id: row.id,
  sku: row.sku,
  description: row.description,
  unitOfMeasure: row.unitOfMeasure,
  onHandQuantity: row.onHandQuantity,
  deactivatedAt: row.deactivatedAt,
  namingCustomerOrderCount: row.namingCustomerOrderCount,
  namingPurchaseDraftLineCount: row.namingPurchaseDraftLineCount,
  latestAdjustment:
    row.latestAdjustmentReason !== null &&
    row.latestAdjustmentQuantity !== null &&
    row.latestAdjustedByUserId !== null &&
    row.latestAdjustedAt !== null
      ? {
          countedQuantity: row.latestAdjustmentQuantity,
          reason: row.latestAdjustmentReason,
          adjustedByUserId: row.latestAdjustedByUserId,
          adjustedAt: row.latestAdjustedAt,
        }
      : null,
  createdAt: row.createdAt,
});
