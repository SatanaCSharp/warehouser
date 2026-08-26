import { Button, Dropdown, Label } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { useCustomerOrderActions } from 'modules/customer-order/hooks/projections/useCustomerOrderActions';
import { CornerDownRightIcon, KebabIcon } from 'shared/icons';

import type { CustomerOrder } from '@warehouser/contracts/customer-orders';
import type { Key, ReactElement } from 'react';

export type CustomerOrderRowProps = {
  order: CustomerOrder;
  onAmend: (order: CustomerOrder) => void;
  onCancel: (order: CustomerOrder) => void;
};

/**
 * The expanded sub-row under a Demand Line (design-handoff.md
 * `Ordering/Customer Order Row`, `s17RG`): indented, `surface/secondary`,
 * never rendered for a Fulfilled or cancelled order (AC-04, AC-17a) — the
 * caller, `DemandRow`, is what filters to `unfulfilled` before mapping this
 * row, so this component carries no state check of its own to duplicate that
 * decision.
 */
export const CustomerOrderRow = ({
  order,
  onAmend,
  onCancel,
}: CustomerOrderRowProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const actionsLabel = t('demand.customerOrder.actions', {
    customerName: order.customerName,
  });
  const actions = useCustomerOrderActions(order, { onAmend, onCancel });

  const onAction = (key: Key): void => {
    actions.find((action) => action.id === key)?.run();
  };

  const menu =
    actions.length === 0 ? null : (
      <Dropdown>
        <Button isIconOnly size="sm" variant="ghost" aria-label={actionsLabel}>
          <KebabIcon />
        </Button>
        <Dropdown.Popover>
          <Dropdown.Menu aria-label={actionsLabel} onAction={onAction}>
            {actions.map(({ id, label }) => (
              <Dropdown.Item id={id} key={id} textValue={label}>
                <Label>{label}</Label>
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    );

  return (
    <tr className="border-b border-border bg-surface-secondary">
      <td className="p-2 pl-12">
        <span className="inline-flex items-center gap-2">
          <CornerDownRightIcon />
          {order.customerName}
        </span>
      </td>
      <td className="p-2">{order.outstandingQuantity}</td>
      <td className="p-2">{order.neededBy}</td>
      {/* eslint-disable-next-line jsx-a11y/control-has-associated-label --
          this `<td>` renders no control at all; it stays empty to keep the
          sub-row aligned with the Demand Row's six columns (matching the
          passing `ItemRow.tsx` precedent). */}
      <td className="p-2" />
      {/* eslint-disable-next-line jsx-a11y/control-has-associated-label -- see above. */}
      <td className="p-2" />
      <td className="p-2">{menu}</td>
    </tr>
  );
};
