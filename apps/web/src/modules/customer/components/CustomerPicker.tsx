import { useTranslation } from 'react-i18next';

import { FormSelectField } from 'shared/components/FormSelectField';

import type { Customer } from '@warehouser/contracts/customers';
import type { ReactElement, ReactNode } from 'react';

export type CustomerPickerProps = {
  className?: string;
  customers: Customer[];
  /**
   * The sentence under the field: its helper text, or — when the caller has
   * disabled it — why it is refused, so the reason is stated where a control
   * disabled by it can point at it (AC-23).
   */
  description?: ReactNode;
  /**
   * Why the field is refused, rendered as its `FieldError`. A caller that
   * marks the field with `isInvalid` states the reason here too, so the
   * `Label`/`FieldError` pairing HeroUI relies on carries a sentence rather
   * than an empty element (`heroui-design-principles.md` §2).
   */
  errorMessage?: ReactNode;
  isDisabled?: boolean;
  isInvalid?: boolean;
  onBlur?: () => void;
  /**
   * Keeps the Customer `value` already names in the list when that Customer
   * has since been deactivated, so a record written before the deactivation
   * still displays what it names instead of rendering an empty field (AC-06).
   *
   * It widens **display**, never the offer: the retained Customer is admitted
   * only because it is already this field's value, so no new record can reach
   * it and no other Inactive Customer appears.
   */
  retainsDeactivatedValue?: boolean;
  value: string;
  onChange: (value: string) => void;
};

/**
 * The Customer picker `modules/customer-order` and `modules/purchase-draft`
 * reach through this module's declared public surface. An Inactive Customer is
 * never offered — it stops being selectable rather than being shown disabled —
 * so every Customer Order already naming it keeps counting exactly as before
 * while a new record cannot pick it up again (AC-06).
 *
 * It takes the Customers it offers rather than reading them, because a
 * Warehouse-scoped read belongs to the surface that already knows which
 * Warehouse it is composing: a picker that fetched for itself could be handed
 * one Warehouse's list while mounted inside another
 * (design-handoff.md §Implementation constraints).
 */
export const CustomerPicker = ({
  className,
  customers,
  description,
  errorMessage,
  isDisabled,
  isInvalid,
  onBlur,
  retainsDeactivatedValue = false,
  value,
  onChange,
}: CustomerPickerProps): ReactElement => {
  const { t } = useTranslation('customer');

  const isOffered = (customer: Customer): boolean =>
    customer.deactivatedAt === null ||
    (retainsDeactivatedValue && customer.id === value);

  const options = customers
    .filter(isOffered)
    .map((customer) => ({ id: customer.id, label: customer.name }));

  return (
    <FormSelectField
      className={className}
      description={description}
      errorMessage={errorMessage}
      isDisabled={isDisabled}
      isInvalid={isInvalid}
      label={t('picker.customer.label')}
      options={options}
      value={value}
      onBlur={onBlur}
      onChange={onChange}
    />
  );
};
