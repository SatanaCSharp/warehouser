import { Card } from '@heroui/react';
import type { CustomerAwaitingOrder } from '@warehouser/contracts/customers';
import { CustomerAwaitingDestination } from 'modules/customer/components/customer-directory/components/awaiting/CustomerAwaitingDestination';
import { CustomerAwaitingItem } from 'modules/customer/components/customer-directory/components/awaiting/CustomerAwaitingItem';
import { CustomerAwaitingNeededBy } from 'modules/customer/components/customer-directory/components/awaiting/CustomerAwaitingNeededBy';
import { CustomerAwaitingQuantity } from 'modules/customer/components/customer-directory/components/awaiting/CustomerAwaitingQuantity';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export type CustomerAwaitingCardProps = {
  order: CustomerAwaitingOrder;
};

/**
 * `Delivery/Awaiting Card Mobile` (`XXFuv`): the mobile counterpart of
 * `zw3n9`, carrying **the same four facts in the same priority order** — item
 * → outstanding → needed by → going to (design-handoff.md §Responsive
 * behavior).
 *
 * Every value is labelled: `40 each` alone says nothing about what it is 40 of
 * or when it is due, so the card states what each figure is before stating it.
 * The four leaves are the same components the table's cells render, so the two
 * surfaces cannot drift apart on a formatter or on the reason a destination is
 * the destination.
 */
export const CustomerAwaitingCard = ({
  order,
}: CustomerAwaitingCardProps): ReactElement => {
  const { t } = useTranslation('customer');

  return (
    <li>
      <Card className="border border-border shadow-none">
        <Card.Header>
          <CustomerAwaitingItem order={order} />
        </Card.Header>
        <Card.Content className="grid gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {t('detail.awaiting.outstanding')}
            </p>
            <CustomerAwaitingQuantity order={order} />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {t('detail.awaiting.neededBy')}
            </p>
            <CustomerAwaitingNeededBy order={order} />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {t('detail.awaiting.goingTo')}
            </p>
            <CustomerAwaitingDestination destination={order.destination} />
          </div>
        </Card.Content>
      </Card>
    </li>
  );
};
