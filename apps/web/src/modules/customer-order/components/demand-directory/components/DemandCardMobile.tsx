import { Button, Chip, Dropdown, Label } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCustomerOrderActions } from 'modules/customer-order/hooks/projections/useCustomerOrderActions';
import { useUnfulfilledCustomerOrders } from 'modules/customer-order/hooks/queries/useUnfulfilledCustomerOrders';
import { Conditional } from 'shared/components/Conditional';
import { ChevronDownIcon, ChevronUpIcon, KebabIcon } from 'shared/icons';

import type {
  CustomerOrder,
  DemandLine,
} from '@warehouser/contracts/customer-orders';
import type { Key, ReactElement } from 'react';

export type DemandCardMobileProps = {
  line: DemandLine;
  onAmend: (order: CustomerOrder) => void;
  onCancel: (order: CustomerOrder) => void;
};

type CustomerOrderCardMobileProps = {
  order: CustomerOrder;
  onAmend: (order: CustomerOrder) => void;
  onCancel: (order: CustomerOrder) => void;
};

/**
 * Mobile counterpart of `CustomerOrderRow` (design-handoff.md
 * `Ordering/Customer Order Card Mobile`, `eGKuW`). Renders only for
 * `DemandCardMobile`, so it stays a private helper in this file rather than a
 * file of its own (`writing-web-components.md` §1).
 */
const CustomerOrderCardMobile = ({
  order,
  onAmend,
  onCancel,
}: CustomerOrderCardMobileProps): ReactElement => {
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
    <li className="rounded-lg bg-surface-secondary p-3 pl-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{order.customerName}</p>
          <p className="text-sm text-muted">
            {order.outstandingQuantity} · {order.neededBy}
          </p>
        </div>
        {menu}
      </div>
    </li>
  );
};

/**
 * One Item's consolidated Unfulfilled demand, carried as a card below the
 * split-view breakpoint (design-handoff.md `Ordering/Demand Card Mobile`,
 * `XYIfs`). Same five facts as the desktop row, re-flowed; identical
 * disclosure and kebab behaviour. Renders only for `DemandDirectory`, so it
 * stays a private helper in this file rather than a file of its own
 * (`writing-web-components.md` §1).
 */
export const DemandCardMobile = ({
  line,
  onAmend,
  onCancel,
}: DemandCardMobileProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const [isExpanded, setIsExpanded] = useState(false);
  const customerOrders = useUnfulfilledCustomerOrders(line.itemId, {
    skip: !isExpanded,
  });

  const onToggleExpanded = (): void => setIsExpanded((expanded) => !expanded);
  const disclosureLabel = t(
    isExpanded ? 'demand.disclosure.hide' : 'demand.disclosure.show',
    {
      count: line.unfulfilledCustomerOrderCount,
      item: `${line.sku}, ${line.description}`,
    },
  );

  const coverageChips =
    line.coverage.length === 0 ? (
      <span className="text-sm text-muted">{t('demand.coverage.none')}</span>
    ) : (
      line.coverage.map((entry) => (
        <Chip
          key={entry.purchaseDraftLineId}
          color="accent"
          size="sm"
          variant="soft"
        >
          {t('demand.coverage.chip', { quantity: entry.statedQuantity })}
        </Chip>
      ))
    );

  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{line.sku}</p>
          <p className="text-sm text-muted">{line.description}</p>
        </div>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-expanded={isExpanded}
          aria-label={disclosureLabel}
          onPress={onToggleExpanded}
        >
          {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </Button>
      </div>
      <div className="mt-2 text-sm">
        <p>{line.totalOutstandingQuantity}</p>
        <p>{line.earliestNeededBy}</p>
        <p>{line.onHandQuantity}</p>
        <div className="mt-1 flex flex-wrap gap-1">{coverageChips}</div>
      </div>
      <Conditional when={isExpanded}>
        <ul className="mt-3 grid gap-2">
          {customerOrders.map((order) => (
            <CustomerOrderCardMobile
              key={order.id}
              order={order}
              onAmend={onAmend}
              onCancel={onCancel}
            />
          ))}
        </ul>
      </Conditional>
    </li>
  );
};
