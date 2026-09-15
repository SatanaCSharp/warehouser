import type { CustomerOrder } from '@warehouser/contracts/customer-orders';
import groupBy from 'lodash/groupBy';
import { useListCustomerOrdersQuery } from 'modules/customer-order/api/customer-order-api';
import { useMemo } from 'react';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

/** One Item's Unfulfilled Customer Orders, by the Item they were placed for. */
export type UnfulfilledCustomerOrdersByItem = Record<string, CustomerOrder[]>;

/**
 * The Warehouse's Unfulfilled Customer Orders, grouped by Item — the expanded
 * sub-rows under every Demand Line (`s17RG`, AC-04, AC-17a).
 *
 * The read is one request for the Warehouse rather than one per expanded row.
 * A React Aria collection builds its rows from data, so a Demand Line carries
 * no chevron until its Customer Orders exist to be expanded into; a per-row
 * read gated on expansion can therefore never fire, because nothing would offer
 * the control that would ungate it
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 *
 * Requesting `state=unfulfilled` server-side is not trusted alone: the response
 * is filtered again here, so a Fulfilled or cancelled order can never render
 * even if a stale cache entry ever disagreed with the query it was cached
 * under.
 */
export const useUnfulfilledCustomerOrdersByItem =
  (): UnfulfilledCustomerOrdersByItem => {
    const warehouseId = useEnteredWarehouse();
    const { currentData } = useListCustomerOrdersQuery(
      { warehouseId: warehouseId ?? '', query: { state: 'unfulfilled' } },
      { skip: warehouseId === undefined },
    );

    // Memoized on the response, not recomputed per render: `DemandTable` keys a
    // React Aria row's cached element tree on the record it was built from, so a
    // grouping that changed identity every render would rebuild every row every
    // render. Stable here means the collection rebuilds exactly when the orders
    // themselves change — which is the moment a Demand Line gains its chevron.
    return useMemo(
      () =>
        groupBy(
          (currentData ?? []).filter((order) => order.state === 'unfulfilled'),
          (order) => order.itemId,
        ),
      [currentData],
    );
  };
