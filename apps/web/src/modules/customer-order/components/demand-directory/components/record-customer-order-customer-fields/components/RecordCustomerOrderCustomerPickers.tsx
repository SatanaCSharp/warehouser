import { Controller, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { CustomerDeliveryAddressPicker } from 'modules/customer/components/CustomerDeliveryAddressPicker';
import { CustomerPicker } from 'modules/customer/components/CustomerPicker';
import { useCustomers } from 'modules/customer/hooks/queries/useCustomers';

import type { RecordCustomerOrderForm } from 'modules/customer-order/utils/record-customer-order-form';
import type { ReactElement } from 'react';
import type { Control } from 'react-hook-form';

export type RecordCustomerOrderCustomerPickersProps = {
  control: Control<RecordCustomerOrderForm>;
  isDisabled: boolean;
};

/**
 * The two fields that turn a recorded order into one naming a **Customer**
 * rather than one carrying a typed name (AC-11): which Customer, and which of
 * its Delivery Addresses — omitted takes the Customer's current Main one,
 * resolved server-side at record time.
 *
 * The address picker is offered against the chosen Customer's own address
 * book, because `customerOrderCreateSchema` refuses an address stated for an
 * order that names no Customer. Both reach `modules/customer` through its
 * declared public surface rather than a second picker being built here, and
 * each is handed the message explaining a refusal it is marked for, so a
 * marked field carries a sentence rather than an empty `FieldError`
 * (`heroui-design-principles.md` §2).
 *
 * It is its own file rather than a private helper of
 * `RecordCustomerOrderCustomerFields` because it owns the Customers read and
 * the watched Customer, and its props are a type worth naming — both triggers
 * `writing-web-components.md` §1 moves a helper out on.
 */
export const RecordCustomerOrderCustomerPickers = ({
  control,
  isDisabled,
}: RecordCustomerOrderCustomerPickersProps): ReactElement => {
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
        render={({ field, fieldState }) => (
          <CustomerPicker
            customers={customers}
            description={t('dialogs.record.customerHelp')}
            errorMessage={fieldState.error?.message}
            isDisabled={isDisabled}
            isInvalid={fieldState.invalid}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
      <Controller
        control={control}
        name="customerDeliveryAddressId"
        render={({ field, fieldState }) => (
          <CustomerDeliveryAddressPicker
            addresses={addresses}
            errorMessage={fieldState.error?.message}
            isDisabled={isDisabled || customerId === ''}
            isInvalid={fieldState.invalid}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
    </>
  );
};
