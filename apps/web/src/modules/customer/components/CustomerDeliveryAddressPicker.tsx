import { useTranslation } from 'react-i18next';

import { FormSelectField } from 'shared/components/FormSelectField';

import type { CustomerDeliveryAddress } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';

export type CustomerDeliveryAddressPickerProps = {
  addresses: CustomerDeliveryAddress[];
  className?: string;
  isDisabled?: boolean;
  isInvalid?: boolean;
  onBlur?: () => void;
  /**
   * Keeps the address `value` already names listed when it has since been made
   * Inactive, so a Customer Order or a frozen line that already names it keeps
   * displaying it instead of rendering a blank field (AC-06a). It widens
   * display, never the offer.
   */
  retainsDeactivatedValue?: boolean;
  value: string;
  onChange: (value: string) => void;
};

/**
 * The Delivery Address picker `modules/customer-order` and
 * `modules/purchase-draft` reach through this module's declared public
 * surface, for the Customer they have already chosen.
 *
 * AC-06a and tile `u12PYn` — an Inactive address is **absent** from the offer
 * rather than shown and disabled, and the field says so under itself, because
 * a member looking for an address they know exists otherwise has to guess why
 * it is not there. That sentence is the field's own `Description`, so a screen
 * reader announces it as the control's description rather than as loose text
 * beside it.
 *
 * The Main address is labelled as such in the list, so choosing "the usual
 * one" does not require remembering which it was (AC-11).
 */
export const CustomerDeliveryAddressPicker = ({
  addresses,
  className,
  isDisabled,
  isInvalid,
  onBlur,
  retainsDeactivatedValue = false,
  value,
  onChange,
}: CustomerDeliveryAddressPickerProps): ReactElement => {
  const { t } = useTranslation('customer');

  const isOffered = (address: CustomerDeliveryAddress): boolean =>
    address.deactivatedAt === null ||
    (retainsDeactivatedValue && address.id === value);

  const options = addresses.filter(isOffered).map((address) => ({
    id: address.id,
    label: address.isMain
      ? t('picker.address.mainOption', { address: address.addressText })
      : address.addressText,
  }));

  return (
    <FormSelectField
      className={className}
      description={t('picker.address.inactiveNote')}
      isDisabled={isDisabled}
      isInvalid={isInvalid}
      label={t('picker.address.label')}
      options={options}
      value={value}
      onBlur={onBlur}
      onChange={onChange}
    />
  );
};
