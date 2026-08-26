import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { usePermittedItems } from 'shared/hooks/projections/usePermittedItems';

import type { CustomerOrder } from '@warehouser/contracts/customer-orders';

export type CustomerOrderAction = {
  id: 'amend' | 'cancel';
  label: string;
  /** The Permission that offers this action. */
  permission: PermissionId;
  run: () => void;
};

export type CustomerOrderActionHandlers = {
  onAmend: (order: CustomerOrder) => void;
  onCancel: (order: CustomerOrder) => void;
};

/**
 * One Customer Order's actions, kept to the ones the actor's Role admits
 * (AC-19, AC-19a). Both `CustomerOrderRow`'s `Dropdown.Menu` and its mobile
 * card read this one projection rather than each declaring its own
 * Permission mapping
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 */
export const useCustomerOrderActions = (
  order: CustomerOrder,
  { onAmend, onCancel }: CustomerOrderActionHandlers,
): CustomerOrderAction[] => {
  const { t } = useTranslation('customer-order');

  return usePermittedItems<CustomerOrderAction>([
    {
      id: 'amend',
      label: t('demand.menu.amend'),
      permission: PermissionId.CUSTOMER_ORDERS_UPDATE,
      run: () => onAmend(order),
    },
    {
      id: 'cancel',
      label: t('demand.menu.cancel'),
      permission: PermissionId.CUSTOMER_ORDERS_CANCEL,
      run: () => onCancel(order),
    },
  ]);
};
