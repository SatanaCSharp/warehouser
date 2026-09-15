import type { DemandLine } from '@warehouser/contracts/customer-orders';
import { useReadDemandQuery } from 'modules/customer-order/api/customer-order-api';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

export type DemandReading = {
  /** True when the read was refused or failed, as opposed to returning none. */
  isError: boolean;
  lines: DemandLine[];
};

/**
 * The Warehouse's consolidated demand, loaded for whoever asks (T19). The
 * gate the route loader applies is `CUSTOMER_ORDERS:WATCH`
 * (`loaders/demand.loader.ts`); this hook reads whatever the loader already
 * committed rather than re-deciding access, so it reports no readiness of its
 * own (`frontend-architecture.md` §Page). `isError` is not readiness and
 * stays: a permitted actor whose read failed must reach the page's own error
 * arm rather than a surface that states the Warehouse holds no demand.
 */
export const useDemand = (): DemandReading => {
  const warehouseId = useEnteredWarehouse();
  const { currentData, isError } = useReadDemandQuery(warehouseId ?? '', {
    skip: warehouseId === undefined,
  });

  return { isError, lines: currentData ?? [] };
};
