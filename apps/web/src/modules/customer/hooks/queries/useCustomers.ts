import { useListCustomersQuery } from 'modules/customer/api/customer-api';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type { Customer } from '@warehouser/contracts/customers';

/**
 * The Warehouse's Customers, loaded for whoever asks (T21). The gate the route
 * loader applies is `CUSTOMERS:WATCH` (`loaders/customer.loader.ts`); this hook
 * reads whatever the loader already committed rather than re-deciding access,
 * so it reports no readiness of its own (`frontend-architecture.md` §Page).
 *
 * The read is keyed by the **entered** Warehouse and skipped until one is
 * resolved, so a Customer never crosses the Warehouse boundary in cache and
 * switching Warehouse refetches rather than reusing the previous answer
 * (design-handoff.md §Implementation constraints).
 */
export const useCustomers = (): Customer[] => {
  const warehouseId = useEnteredWarehouse();
  const { currentData } = useListCustomersQuery(warehouseId ?? '', {
    skip: warehouseId === undefined,
  });

  return currentData ?? [];
};
