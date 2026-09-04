import { PermissionId } from '@warehouser/shared-types/enums';

import { RecordCustomerOrderCustomerPickers } from 'modules/customer-order/components/demand-directory/components/record-customer-order-customer-fields/components/RecordCustomerOrderCustomerPickers';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';

import type { RecordCustomerOrderCustomerPickersProps } from 'modules/customer-order/components/demand-directory/components/record-customer-order-customer-fields/components/RecordCustomerOrderCustomerPickers';
import type { ReactNode } from 'react';

/**
 * The gate around `RecordCustomerOrderCustomerPickers`.
 *
 * It gates itself on `CUSTOMERS:WATCH` rather than being handed a boolean
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`), and the read
 * the pickers depend on lives **inside** the gate: a member who may not read
 * Customers issues no request for them and is simply offered the typed-name
 * field alone, which is what AC-11a already describes as a whole way of
 * recording demand rather than a degraded one (design-handoff.md §States).
 */
export const RecordCustomerOrderCustomerFields = ({
  control,
  isDisabled,
}: RecordCustomerOrderCustomerPickersProps): ReactNode => (
  <WarehousePermissionGate permission={PermissionId.CUSTOMERS_WATCH}>
    <RecordCustomerOrderCustomerPickers
      control={control}
      isDisabled={isDisabled}
    />
  </WarehousePermissionGate>
);
