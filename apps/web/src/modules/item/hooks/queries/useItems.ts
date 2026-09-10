import type { Item } from '@warehouser/contracts/items';
import { useListItemsQuery } from 'modules/item/api/item-api';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

/**
 * The Warehouse's Items, loaded for whoever asks (T18). The gate the route
 * loader applies is `ITEMS:WATCH` (`loaders/item.loader.ts`); this hook reads
 * whatever the loader already committed rather than re-deciding access, so it
 * reports no readiness of its own (`frontend-architecture.md` §Page).
 */
export const useItems = (): Item[] => {
  const warehouseId = useEnteredWarehouse();
  const { currentData } = useListItemsQuery(warehouseId ?? '', {
    skip: warehouseId === undefined,
  });

  return currentData ?? [];
};
