import { useReadCustomerQuery } from 'modules/customer/api/customer-api';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type { CustomerDetail } from '@warehouser/contracts/customers';

export type CustomerDetailReading = {
  detail: CustomerDetail | undefined;
  /** Whether the read settled as a refusal rather than not having settled yet. */
  isError: boolean;
};

/**
 * One Customer with its address book and everything it is still waiting for
 * (AC-08). `detail` is `undefined` until a Customer is opened and its read
 * resolves; `isError` is what tells a refused read apart from an unresolved
 * one, so a member who will never get this Customer is not left watching a
 * skeleton for good.
 *
 * Keyed by the entered Warehouse as well as by the Customer, so the answer can
 * never be the one another Warehouse gave for a same-named record (AC-03a).
 */
export const useCustomerDetail = (
  customerId: string | undefined,
): CustomerDetailReading => {
  const warehouseId = useEnteredWarehouse();
  const { currentData, isError } = useReadCustomerQuery(
    { warehouseId: warehouseId ?? '', customerId: customerId ?? '' },
    { skip: warehouseId === undefined || customerId === undefined },
  );

  return { detail: currentData, isError };
};
