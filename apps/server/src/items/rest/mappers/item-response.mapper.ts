import type { Item } from '@warehouser/contracts/items';
import type { ItemCatalogueEntryRead } from 'items/domain/mappers/item-catalogue-entry.mapper.js';

// The catalogue entry as the application boundary returns it -> openapi.yaml `Item`. The boundary
// hands instants back as `Date`; the contract carries them as date-times, and converting them is
// the REST layer's own translation (server-architecture.md § REST), so it lives here rather than in
// the controller that used to hold it: every route of `ItemsController` returns this same shape,
// and a mapping written into its one caller is a mapping the next caller copies.
//
// Every property is named rather than spread, for the reason `purchase-draft-response.mapper.ts`
// gives: a spread satisfies the contract type without excess-property checking, so a field later
// added to the read would reach the wire unannounced.
export const toItemResponse = (entry: ItemCatalogueEntryRead): Item => ({
  id: entry.id,
  sku: entry.sku,
  description: entry.description,
  unitOfMeasure: entry.unitOfMeasure,
  onHandQuantity: entry.onHandQuantity,
  deactivatedAt: entry.deactivatedAt?.toISOString() ?? null,
  namingCustomerOrderCount: entry.namingCustomerOrderCount,
  namingPurchaseDraftLineCount: entry.namingPurchaseDraftLineCount,
  latestAdjustment: entry.latestAdjustment
    ? {
        countedQuantity: entry.latestAdjustment.countedQuantity,
        reason: entry.latestAdjustment.reason,
        adjustedByUserId: entry.latestAdjustment.adjustedByUserId,
        adjustedAt: entry.latestAdjustment.adjustedAt.toISOString(),
      }
    : null,
  createdAt: entry.createdAt.toISOString(),
});
