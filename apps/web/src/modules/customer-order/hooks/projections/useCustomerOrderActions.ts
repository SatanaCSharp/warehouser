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
 * (AC-19, AC-19a). The Demand table's sub-rows and their mobile cards both read
 * this one projection rather than each declaring its own Permission mapping
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 *
 * It is called by the component that renders the menu, never by whatever
 * renders the collection above it. A React Aria collection caches a row's
 * element tree per record, so a value read above it and closed over would
 * still be the one that existed when the row was first built — an actor whose
 * Permissions resolved a moment later would be offered nothing, for good
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
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
