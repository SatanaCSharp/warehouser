import { useListPackagingTypesQuery } from 'modules/purchase-draft/api/purchase-draft-api';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type { PackagingType } from '@warehouser/contracts/purchase-drafts';

/** The Packaging Type catalogue (AC-12, AC-13), read the same way `useItems` reads the
 * Item catalogue: whatever the actor's `PURCHASE_DRAFTS:WATCH` projection already admits. */
export const usePackagingTypes = (): PackagingType[] => {
  const warehouseId = useEnteredWarehouse();
  const { currentData } = useListPackagingTypesQuery(warehouseId ?? '', {
    skip: warehouseId === undefined,
  });

  return currentData ?? [];
};
