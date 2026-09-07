import { Button, Dropdown, Label } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { useReactivateCustomerMutation } from 'modules/customer/api/customer-api';
import { useCustomerActions } from 'modules/customer/hooks/projections/useCustomerActions';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { KebabIcon } from 'shared/icons';

import type { Customer } from '@warehouser/contracts/customers';
import type { CustomerActionHandlers } from 'modules/customer/hooks/projections/useCustomerActions';
import type { Key, ReactNode } from 'react';

export type CustomerActionsMenuProps = CustomerActionHandlers & {
  customer: Customer;
};

/**
 * The kebab the opened Customer's detail header carries (frame `KRDln`); the
 * list cards carry none. Its accessible name identifies its subject —
 * `Actions for Nordwind Logistik GmbH` — matching the convention documented
 * for Users Management (design-handoff.md §Accessibility).
 *
 * It reads its own actions rather than being handed them, and an actor
 * permissioned for none of them gets no trigger at all rather than an empty
 * menu — the collection form of what a `WarehousePermissionGate` does to a
 * control it protects
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 *
 * **Reactivating is run here, not reported upward.** AC-06 makes it a decision
 * that asks nothing, so it is a bare request rather than a dialog — and a
 * request needs the Warehouse it is addressed to, which a handler assembled
 * above the collection would have captured when the card was first built.
 * Deactivating states what it leaves behind, so it stays a report.
 */
export const CustomerActionsMenu = ({
  customer,
  onCorrect,
  onDeactivate,
}: CustomerActionsMenuProps): ReactNode => {
  const { t } = useTranslation('customer');
  const warehouseId = useEnteredWarehouse();
  const [reactivateCustomer] = useReactivateCustomerMutation();
  const label = t('menu.customer.actions', { name: customer.name });

  const onToggleActive = (chosen: Customer): void => {
    if (chosen.deactivatedAt === null) {
      onDeactivate(chosen);
      return;
    }
    void reactivateCustomer({
      customerName: chosen.name,
      warehouseId: warehouseId ?? '',
      customerId: chosen.id,
    });
  };

  const actions = useCustomerActions(customer, { onCorrect, onToggleActive });

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
          {/* AC-23 — the reason belongs on the item that is refused, not on
              the menu around it: a disabled `Dropdown.Item` is `aria-disabled`
              rather than `disabled`, so it still takes focus and announces its
              own description each time it does. */}
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
