import { useTranslation } from 'react-i18next';

import { FormSelectField } from 'shared/components/FormSelectField';

import type { CustomerOrder } from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';

export type CustomerOrderPickerProps = {
  className?: string;
  /** The Unfulfilled Customer Orders of the Item the caller has already picked. */
  customerOrders: CustomerOrder[];
  isDisabled?: boolean;
  isInvalid?: boolean;
  onBlur?: () => void;
  value: string;
  onChange: (value: string) => void;
};

/**
 * The Customer Order picker `modules/purchase-draft` reaches through this
 * module's declared public surface to link a Purchase Draft Line to the
 * demand it intends to serve (AC-10, AC-11a). Only Unfulfilled Customer
 * Orders are ever offered — a Fulfilled or cancelled order is never linkable
 * demand — so the caller passes the same set `useUnfulfilledCustomerOrders`
 * already filters (AC-04, AC-17a).
 */
export const CustomerOrderPicker = ({
  className,
  customerOrders,
  isDisabled,
  isInvalid,
  onBlur,
  value,
  onChange,
}: CustomerOrderPickerProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const options = customerOrders.map((order) => ({
    id: order.id,
    label: t('picker.optionLabel', {
      customerName: order.customerName,
      quantity: order.outstandingQuantity,
      neededBy: order.neededBy,
    }),
  }));

  return (
    <FormSelectField
      className={className}
      isDisabled={isDisabled}
      isInvalid={isInvalid}
      label={t('picker.label')}
      options={options}
      value={value}
      onBlur={onBlur}
      onChange={onChange}
    />
  );
};
