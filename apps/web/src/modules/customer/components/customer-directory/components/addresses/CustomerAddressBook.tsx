import { useTranslation } from 'react-i18next';

import {
  useCorrectCustomerDeliveryAddressMutation,
  useDeactivateCustomerDeliveryAddressMutation,
} from 'modules/customer/api/customer-api';
import { AddDeliveryAddressAction } from 'modules/customer/components/customer-directory/components/addresses/AddDeliveryAddressAction';
import { CorrectDeliveryAddressDialog } from 'modules/customer/components/customer-directory/components/addresses/CorrectDeliveryAddressDialog';
import { CustomerAddressRow } from 'modules/customer/components/customer-directory/components/addresses/CustomerAddressRow';
import { DeactivateDeliveryAddressDialog } from 'modules/customer/components/customer-directory/components/addresses/DeactivateDeliveryAddressDialog';
import { ActionDialogHost } from 'shared/components/ActionDialogHost';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { useActionDialog } from 'shared/hooks/state/useActionDialog';

import type {
  Customer,
  CustomerDeliveryAddress,
  CustomerDeliveryAddressUpdate,
} from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

/** Which per-address dialog a row's kebab opens. */
type AddressDialogKind = 'correct' | 'deactivate';

export type CustomerAddressBookProps = {
  customer: Customer;
};

/**
 * The Customer's address book (`KRDln`, `b7gaH9`): one `Delivery/Address Row`
 * per address, active and Inactive alike, in the order the server returns them
 * — by creation time — so an address never moves under a member's cursor
 * because its Main flag changed.
 *
 * It is its own **surface** in the reducer-driven sense: it holds its own
 * `Kind` union and its own `useActionDialog` controller, because a row of this
 * list opens a dialog of this list and of nothing else
 * (`docs/system/adr/27-08-2026-reducer-driven-action-dialogs.md`). Collecting
 * it into the destination's controller would be the module-wide workflow
 * switch that decision exists to prevent.
 */
export const CustomerAddressBook = ({
  customer,
}: CustomerAddressBookProps): ReactElement => {
  const { t } = useTranslation('customer');
  const warehouseId = useEnteredWarehouse();
  const dialog = useActionDialog<AddressDialogKind, CustomerDeliveryAddress>();
  const [correctAddress] = useCorrectCustomerDeliveryAddressMutation();
  const [deactivateAddress] = useDeactivateCustomerDeliveryAddressMutation();

  const onCorrect = (address: CustomerDeliveryAddress): void =>
    dialog.open('correct', address);
  const onDeactivate = (address: CustomerDeliveryAddress): void =>
    dialog.open('deactivate', address);

  const onSaveCorrection =
    (address: CustomerDeliveryAddress) =>
    (input: CustomerDeliveryAddressUpdate): Promise<MutationResult> =>
      correctAddress({
        customerName: customer.name,
        warehouseId: warehouseId ?? '',
        customerId: customer.id,
        deliveryAddressId: address.id,
        input,
      });

  const onConfirmDeactivate =
    (address: CustomerDeliveryAddress) => (): Promise<MutationResult> =>
      deactivateAddress({
        customerName: customer.name,
        warehouseId: warehouseId ?? '',
        customerId: customer.id,
        deliveryAddressId: address.id,
      });

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground">
          {t('detail.addresses.heading')}
        </h3>
        <AddDeliveryAddressAction customer={customer} />
      </div>

      <ul
        aria-label={t('detail.addresses.listLabel', { name: customer.name })}
        className="mt-4 grid gap-3"
      >
        {customer.deliveryAddresses.map((address) => (
          <CustomerAddressRow
            key={address.id}
            address={address}
            customerId={customer.id}
            customerName={customer.name}
            onCorrect={onCorrect}
            onDeactivate={onDeactivate}
          />
        ))}
      </ul>

      <ActionDialogHost
        controller={dialog}
        renderDialogs={{
          correct: (address) => (
            <CorrectDeliveryAddressDialog
              address={address}
              onSave={onSaveCorrection(address)}
            />
          ),
          deactivate: (address) => (
            <DeactivateDeliveryAddressDialog
              address={address}
              onConfirm={onConfirmDeactivate(address)}
            />
          ),
        }}
      />
    </section>
  );
};
