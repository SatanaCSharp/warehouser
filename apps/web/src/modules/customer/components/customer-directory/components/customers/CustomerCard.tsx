import { Card, Chip } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { CustomerActionsMenu } from 'modules/customer/components/customer-directory/components/customers/CustomerActionsMenu';
import { Conditional } from 'shared/components/Conditional';

import type { Customer } from '@warehouser/contracts/customers';
import type { CustomerActionHandlers } from 'modules/customer/hooks/projections/useCustomerActions';
import type { ReactElement } from 'react';

export type CustomerCardProps = CustomerActionHandlers & {
  customer: Customer;
  isSelected: boolean;
  onSelect: (customerId: string) => void;
};

/**
 * `Delivery/Customer Card` (`r80F1`): the Customer's name, the meta line
 * counting the addresses its goods may be sent to, and the `Inactive` chip
 * when it carries one.
 *
 * Selected is a 2px `accent` stroke, matching the draft and warehouse cards
 * already shipped — and it is never the only signal, because the opened
 * Customer is also the one the detail pane names.
 *
 * The Customer's name is a real `<button>` rather than a clickable `<div>`:
 * opening a Customer is an action, so it has to be reachable and announced as
 * one. The kebab sits **outside** that button, because a control inside a
 * control is unreachable by keyboard.
 *
 * The heading wraps the control rather than the control wrapping the heading.
 * A `<button>` admits phrasing content only, so putting `Card.Title` (an
 * `h3`) and `Card.Description` (a `p`) inside one is an invalid content model
 * and sweeps the meta line into the button's accessible name; using the
 * components as designed is what keeps the announcement right
 * (`heroui-design-principles.md` §2). The control is therefore named by the
 * Customer alone, which is also the only thing pressing it acts on.
 */
export const CustomerCard = ({
  customer,
  isSelected,
  onCorrect,
  onDeactivate,
  onSelect,
}: CustomerCardProps): ReactElement => {
  const { t } = useTranslation('customer');
  const addressCount = customer.deliveryAddresses.filter(
    (address) => address.deactivatedAt === null,
  ).length;

  const onPress = (): void => onSelect(customer.id);

  return (
    <li>
      <Card
        className={
          isSelected
            ? 'border-2 border-accent shadow-none'
            : 'border border-border shadow-none'
        }
      >
        <Card.Header className="flex flex-row items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Card.Title className="text-base font-semibold">
              <button className="text-left" type="button" onClick={onPress}>
                {customer.name}
              </button>
            </Card.Title>
            <Card.Description className="text-muted">
              {t('card.addresses', { count: addressCount })}
            </Card.Description>
            <Conditional when={customer.deactivatedAt !== null}>
              <Chip className="mt-2" color="default" size="sm" variant="soft">
                {t('card.inactive')}
              </Chip>
            </Conditional>
          </div>
          <CustomerActionsMenu
            customer={customer}
            onCorrect={onCorrect}
            onDeactivate={onDeactivate}
          />
        </Card.Header>
      </Card>
    </li>
  );
};
