import type { CustomerOrder } from '@warehouser/contracts/customer-orders';
import { useCustomerOrderNaming } from 'modules/customer-order/hooks/projections/useCustomerOrderNaming';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { FormSelectField } from 'shared/components/FormSelectField';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

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
 *
 * Its option label goes through `useLocaleFormat()` like every other quantity
 * and date this feature renders: no frame draws a raw ISO date or an ungrouped
 * number anywhere, and a picker offering `500 · by 2026-09-01` beside a table
 * reading `500 · by 1 Sep 2026` would be the same order stated two ways.
 *
 * Its props are unchanged — `modules/purchase-draft` consumes this component
 * through the declared public surface.
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
  const format = useLocaleFormat();
  const naming = useCustomerOrderNaming();
  const options = customerOrders.map((order) => ({
    id: order.id,
    label: t('picker.optionLabel', {
      customerName: naming(order),
      quantity: format.quantity(order.outstandingQuantity),
      neededBy: format.calendarDate(order.neededBy),
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
