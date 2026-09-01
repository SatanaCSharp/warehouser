import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { usePermittedItems } from 'shared/hooks/projections/usePermittedItems';

import type { CustomerOrder } from '@warehouser/contracts/customer-orders';

export type CustomerOrderAction = {
  id: 'amend' | 'cancel';
  /**
   * Whether the Warehouse still accepts the change (AC-23). The action stays
   * offered and is disabled, rather than disappearing, so a member can see why
   * the site they belong to no longer accepts work.
   */
  isDisabled: boolean;
  label: string;
  /** The Permission that offers this action. */
  permission: PermissionId;
  /**
   * The element stating why the action is disabled, for `aria-describedby`.
   * `undefined` while nothing disables it, which is what that attribute takes
   * to mean "no description" — so the menu item never points at an element the
   * page has not rendered.
   */
  reasonId: string | undefined;
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
  const { isArchived, reasonId } = useArchivedWarehouse();

  return usePermittedItems<CustomerOrderAction>([
    {
      id: 'amend',
      isDisabled: isArchived,
      label: t('demand.menu.amend'),
      permission: PermissionId.CUSTOMER_ORDERS_UPDATE,
      reasonId,
      run: () => onAmend(order),
    },
    {
      id: 'cancel',
      isDisabled: isArchived,
      label: t('demand.menu.cancel'),
      permission: PermissionId.CUSTOMER_ORDERS_CANCEL,
      reasonId,
      run: () => onCancel(order),
    },
  ]);
};
