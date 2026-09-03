import { Button, Dropdown, Label } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { useCustomerOrderActions } from 'modules/customer-order/hooks/projections/useCustomerOrderActions';
import { customerOrderDisplayName } from 'modules/customer-order/utils/customer-order-identity';
import { KebabIcon } from 'shared/icons';

import type { CustomerOrder } from '@warehouser/contracts/customer-orders';
import type { CustomerOrderActionHandlers } from 'modules/customer-order/hooks/projections/useCustomerOrderActions';
import type { Key, ReactNode } from 'react';

export type CustomerOrderActionsMenuProps = CustomerOrderActionHandlers & {
  order: CustomerOrder;
};

/**
 * The kebab menu one Unfulfilled Customer Order carries (design-handoff.md
 * `Ordering/Customer Order Row`, `s17RG`, and its mobile card `eGKuW`). Both
 * surfaces render this one component, so neither can offer the actor a
 * different menu from the other.
 *
 * It reads its own actions rather than being handed them. This is the rule for
 * anything inside a React Aria collection: the collection caches a row's
 * element tree per record, so a list resolved above it and passed in would
 * never be re-resolved — but this component subscribes to the Permissions
 * projection itself, so it re-renders when that resolves regardless of the
 * cache (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 *
 * An actor permissioned for none of the actions gets no trigger at all rather
 * than an empty menu.
 */
export const CustomerOrderActionsMenu = ({
  order,
  onAmend,
  onCancel,
}: CustomerOrderActionsMenuProps): ReactNode => {
  const { t } = useTranslation('customer-order');
  const label = t('demand.customerOrder.actions', {
    customerName: customerOrderDisplayName(order),
  });
  const actions = useCustomerOrderActions(order, { onAmend, onCancel });

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
          {/* AC-23 — an archived Warehouse leaves each action listed and
              disabled rather than removing it, and each one names the sentence
              that says why: `aria-describedby` belongs on the item that is
              refused, not on the menu around it, because a screen reader
              announces an item's description when that item takes focus.
              `reasonId` is `undefined` while nothing disables the action, so
              nothing points at an element the page has not rendered. */}
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
