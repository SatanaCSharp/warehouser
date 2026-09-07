import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CustomerDeliveryAddressPicker } from 'modules/customer/components/CustomerDeliveryAddressPicker';
import { CustomerPicker } from 'modules/customer/components/CustomerPicker';
import { useCustomers } from 'modules/customer/hooks/queries/useCustomers';

import type { ReactElement } from 'react';

export type DirectDestinationPickersProps = {
  isDisabled: boolean;
  /** The address the line already names, or `''` while none has been chosen. */
  customerDeliveryAddressId: string;
  /** The Customer that address belongs to, or `''` while none has been chosen. */
  customerId: string;
  onChangeAddress: (customerDeliveryAddressId: string) => void;
};

/**
 * Where a **Direct to Customer** line's goods travel: which Customer, and
 * which of its Delivery Addresses (`jnl1h`'s `Goes to` field, AC-13).
 *
 * Naming the address is the write: `purchaseDraftLineUpdateSchema` refuses
 * `direct_to_customer` without a `customerDeliveryAddressId`, so the mode
 * alone is not a submittable revision and the line is recorded once the member
 * has said where it goes.
 *
 * AC-14's refusal — the Warehouse's own address on a direct line — is the
 * server's, and is structurally unreachable from here: the Warehouse's address
 * is columns on `warehouses` and has no identifier this picker could offer.
 * Nothing binds that code to this field, and nothing needs to: no
 * `fieldErrorsForCode` entry maps it, because the payload that would raise it
 * cannot be composed here.
 *
 * Both pickers reach `modules/customer` through its declared public surface
 * rather than a third picker being built here.
 *
 * It is its own file rather than a private helper of `DirectDestinationFields`
 * because it owns the Customers read and the chosen-Customer state, and its
 * props are a type worth naming — both triggers `writing-web-components.md`
 * §1 moves a helper out on.
 */
export const DirectDestinationPickers = ({
  isDisabled,
  customerDeliveryAddressId,
  customerId,
  onChangeAddress,
}: DirectDestinationPickersProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const customers = useCustomers();
  // Which Customer's address book is on offer is a choice the member makes on
  // the way to naming an address, and nothing outside this block reads it — so
  // it is transient state owned by the control that triggers it
  // (`writing-web-components.md` §9).
  const [chosenCustomerId, setChosenCustomerId] = useState(customerId);

  const onChangeCustomer = (selected: string): void => {
    setChosenCustomerId(selected);
    onChangeAddress('');
  };

  const addresses =
    customers.find((customer) => customer.id === chosenCustomerId)
      ?.deliveryAddresses ?? [];

  return (
    <div className="mt-3 flex flex-col gap-3 md:flex-row">
      <CustomerPicker
        className="md:flex-1"
        customers={customers}
        description={t('lineDelivery.customerCaption')}
        isDisabled={isDisabled}
        retainsDeactivatedValue
        value={chosenCustomerId}
        onChange={onChangeCustomer}
      />
      <CustomerDeliveryAddressPicker
        addresses={addresses}
        className="md:flex-1"
        isDisabled={isDisabled || chosenCustomerId === ''}
        retainsDeactivatedValue
        value={customerDeliveryAddressId}
        onChange={onChangeAddress}
      />
    </div>
  );
};
