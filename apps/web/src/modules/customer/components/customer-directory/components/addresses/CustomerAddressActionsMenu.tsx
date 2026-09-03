import { Button, Dropdown, Label } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import {
  useReactivateCustomerDeliveryAddressMutation,
  useSetMainCustomerDeliveryAddressMutation,
} from 'modules/customer/api/customer-api';
import { useDeliveryAddressActions } from 'modules/customer/hooks/projections/useDeliveryAddressActions';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { KebabIcon } from 'shared/icons';

import type { CustomerDeliveryAddress } from '@warehouser/contracts/customers';
import type { DeliveryAddressActionHandlers } from 'modules/customer/hooks/projections/useDeliveryAddressActions';
import type { Key, ReactNode } from 'react';

export type CustomerAddressActionsMenuProps = DeliveryAddressActionHandlers & {
  address: CustomerDeliveryAddress;
  customerId: string;
  customerName: string;
};

/**
 * The kebab one `Delivery/Address Row` carries (`LdZmY`), 28×28 as drawn for a
 * nested row. Its accessible name identifies its subject — `Actions for
 * Hafenstraße 14, 20457 Hamburg` (design-handoff.md §Accessibility).
 *
 * **Marking Main and reactivating are run here, not reported upward.** Both
 * ask nothing (AC-04, AC-06a), so each is a bare request rather than a dialog
 * — and a request needs the Warehouse it is addressed to, which this component
 * reads on every render rather than capturing when the row was built
 * (`docs/system/adr/19-08-2026-generated-mutation-hooks-in-components.md`).
 * Correcting and deactivating state something first, so both stay reports and
 * the address book opens their dialogs.
 */
export const CustomerAddressActionsMenu = ({
  address,
  customerId,
  customerName,
  onCorrect,
  onDeactivate,
}: CustomerAddressActionsMenuProps): ReactNode => {
  const { t } = useTranslation('customer');
  const warehouseId = useEnteredWarehouse();
  const [setMainAddress] = useSetMainCustomerDeliveryAddressMutation();
  const [reactivateAddress] = useReactivateCustomerDeliveryAddressMutation();
  const label = t('menu.address.actions', { address: address.addressText });

  const addressed = {
    customerName,
    warehouseId: warehouseId ?? '',
    customerId,
    deliveryAddressId: address.id,
  };

  const onSetMain = (): void => void setMainAddress(addressed);

  const onToggleActive = (chosen: CustomerDeliveryAddress): void => {
    if (chosen.deactivatedAt === null) {
      onDeactivate(chosen);
      return;
    }
    void reactivateAddress(addressed);
  };

  const actions = useDeliveryAddressActions(address, {
    onCorrect,
    onSetMain,
    onToggleActive,
  });

  const onAction = (key: Key): void => {
    actions.find((action) => action.id === key)?.run();
  };

  if (actions.length === 0) {
    return null;
  }

  const disabledKeys = actions
    .filter((action) => action.isDisabled)
    .map((action) => action.id);

  return (
    <Dropdown>
      <Button isIconOnly size="sm" variant="ghost" aria-label={label}>
        <KebabIcon />
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu
          aria-label={label}
          disabledKeys={disabledKeys}
          onAction={onAction}
        >
          {actions.map(({ id, label: actionLabel, reasonId }) => (
            <Dropdown.Item
              aria-describedby={reasonId}
              id={id}
              key={id}
              textValue={actionLabel}
            >
              <Label>{actionLabel}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
};
