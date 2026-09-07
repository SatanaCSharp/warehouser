import { useTranslation } from 'react-i18next';

import { CustomerAwaitingCard } from 'modules/customer/components/customer-directory/components/awaiting/CustomerAwaitingCard';
import { CustomerAwaitingTable } from 'modules/customer/components/customer-directory/components/awaiting/CustomerAwaitingTable';
import { DatasetEmptyState } from 'shared/components/DatasetEmptyState';
import { PackageCheckIcon } from 'shared/icons';

import type { CustomerDetail } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';

export type CustomerAwaitingListProps = {
  detail: CustomerDetail;
};

/** Which of the section's two states is on screen. */
type AwaitingState = 'empty' | 'ready';

/**
 * What the Customer is still waiting for (AC-08): every **Unfulfilled**
 * Customer Order with its Item, what is still owed, when it is needed by and
 * where it is going. Fulfilled and cancelled orders never appear — the server
 * omits them (`customerDetailSchema`), so nothing here filters them out again.
 *
 * The table is the desktop surface and the cards are the mobile one, both fed
 * the same orders, so neither can show a fact the other does not.
 */
export const CustomerAwaitingList = ({
  detail,
}: CustomerAwaitingListProps): ReactElement => {
  const { t } = useTranslation('customer');
  const orders = detail.awaitingCustomerOrders;
  const label = t('detail.awaiting.tableLabel', { name: detail.name });
  const state: AwaitingState = orders.length === 0 ? 'empty' : 'ready';

  const content: Record<AwaitingState, ReactElement> = {
    empty: (
      <DatasetEmptyState
        description={t('detail.awaiting.empty.description')}
        heading={t('detail.awaiting.empty.heading', { name: detail.name })}
        icon={<PackageCheckIcon />}
      />
    ),
    ready: (
      <>
        <CustomerAwaitingTable label={label} orders={orders} />
        <ul aria-label={label} className="mt-4 grid gap-3 lg:hidden">
          {orders.map((order) => (
            <CustomerAwaitingCard key={order.customerOrderId} order={order} />
          ))}
        </ul>
      </>
    ),
  };

  return (
    <section>
      <h3 className="text-lg font-semibold text-foreground">
        {t('detail.awaiting.heading')}
      </h3>
      {content[state]}
    </section>
  );
};
