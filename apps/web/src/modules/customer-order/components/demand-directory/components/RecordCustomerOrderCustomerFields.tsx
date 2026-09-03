import { PermissionId } from '@warehouser/shared-types/enums';
import { Controller, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { CustomerDeliveryAddressPicker } from 'modules/customer/components/CustomerDeliveryAddressPicker';
import { CustomerPicker } from 'modules/customer/components/CustomerPicker';
import { useCustomers } from 'modules/customer/hooks/queries/useCustomers';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';

import type { ReactElement, ReactNode } from 'react';
import type { Control } from 'react-hook-form';

/**
 * The record-demand form's field shape.
 *
 * It is declared here rather than in the dialog that owns the form, so the
 * dependency between the two files runs one way: the dialog imports these
 * fields, and these fields import nothing back from it.
 */
export type RecordCustomerOrderForm = {
  itemId: string;
  customerId: string;
  customerDeliveryAddressId: string;
  customerName: string;
  quantity: number;
  neededBy: string;
};

export type RecordCustomerOrderCustomerFieldsProps = {
  control: Control<RecordCustomerOrderForm>;
  isDisabled: boolean;
};

/**
 * The two fields that turn a recorded order into one naming a **Customer**
 * rather than one carrying a typed name (AC-11): which Customer, and which of
 * its Delivery Addresses — omitted takes the Customer's current Main one,
 * resolved server-side at record time.
 *
 * It gates itself on `CUSTOMERS:WATCH` rather than being handed a boolean
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`), and the read
 * lives **inside** the gate: a member who may not read Customers issues no
 * request for them and is simply offered the typed-name field alone, which is
 * what AC-11a already describes as a whole way of recording demand rather than
 * a degraded one.
 *
 * The address picker is offered against the chosen Customer's own address
 * book, because `customerOrderCreateSchema` refuses an address stated for an
 * order that names no Customer. Both reach `modules/customer` through its
 * declared public surface rather than a second picker being built here.
 */
const RecordCustomerOrderCustomerPickers = ({
  control,
  isDisabled,
}: RecordCustomerOrderCustomerFieldsProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const customers = useCustomers();
  const customerId = useWatch({ control, name: 'customerId' });

  const addresses =
    customers.find((customer) => customer.id === customerId)
      ?.deliveryAddresses ?? [];

  return (
    <>
      <Controller
        control={control}
        name="customerId"
        render={({ field }) => (
          <CustomerPicker
            customers={customers}
            description={t('dialogs.record.customerHelp')}
            isDisabled={isDisabled}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
      <Controller
        control={control}
        name="customerDeliveryAddressId"
        render={({ field }) => (
          <CustomerDeliveryAddressPicker
            addresses={addresses}
            isDisabled={isDisabled || customerId === ''}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
    </>
  );
};

/**
 * The gate around the pickers above. It is separate so the read they depend on
 * is never issued for an actor the gate closes over — nothing is requested for
 * a dataset the actor may not read (design-handoff.md §States).
 */
export const RecordCustomerOrderCustomerFields = ({
  control,
  isDisabled,
}: RecordCustomerOrderCustomerFieldsProps): ReactNode => (
  <WarehousePermissionGate permission={PermissionId.CUSTOMERS_WATCH}>
    <RecordCustomerOrderCustomerPickers
      control={control}
      isDisabled={isDisabled}
    />
  </WarehousePermissionGate>
);
