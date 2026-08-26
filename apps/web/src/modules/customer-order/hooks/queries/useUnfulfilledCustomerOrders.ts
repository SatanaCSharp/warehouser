import { useListCustomerOrdersQuery } from 'modules/customer-order/api/customer-order-api';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type { CustomerOrder } from '@warehouser/contracts/customer-orders';

/**
 * One Item's Unfulfilled Customer Orders — the expanded sub-rows under a
 * Demand Line (`s17RG`) and the linkable set the Customer Order picker offers
 * `modules/purchase-draft` (AC-04, AC-17a). Requesting `state=unfulfilled`
 * server-side is not trusted alone: `demandLines` filters again on the client,
 * so a Fulfilled or cancelled order can never render even if a stale cache
 * entry ever disagreed with the query it was cached under.
 */
export const useUnfulfilledCustomerOrders = (
  itemId: string,
  { skip = false }: { skip?: boolean } = {},
): CustomerOrder[] => {
  const warehouseId = useEnteredWarehouse();
  const { currentData } = useListCustomerOrdersQuery(
    { warehouseId: warehouseId ?? '', query: { itemId, state: 'unfulfilled' } },
    { skip: skip || warehouseId === undefined },
  );

  return (currentData ?? []).filter((order) => order.state === 'unfulfilled');
};
