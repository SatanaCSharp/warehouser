import { Table } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { CustomerAwaitingDestination } from 'modules/customer/components/customer-directory/components/awaiting/CustomerAwaitingDestination';
import { CustomerAwaitingItem } from 'modules/customer/components/customer-directory/components/awaiting/CustomerAwaitingItem';
import { CustomerAwaitingNeededBy } from 'modules/customer/components/customer-directory/components/awaiting/CustomerAwaitingNeededBy';
import { CustomerAwaitingQuantity } from 'modules/customer/components/customer-directory/components/awaiting/CustomerAwaitingQuantity';

import type { CustomerAwaitingOrder } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';

export type CustomerAwaitingTableProps = {
  /** Names the table for assistive technology. */
  label: string;
  orders: CustomerAwaitingOrder[];
};

/**
 * `Delivery/Awaiting Row` (`zw3n9`) from the split-view breakpoint up: four
 * cells per Unfulfilled Customer Order — item, outstanding, needed by, going
 * to — in the priority order both frames fix (AC-08).
 *
 * It is a HeroUI `Table`, not a hand-assembled `<table>`
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`), and its
 * row renderer is a plain function that resolves nothing per order: every cell
 * that reads a translation or a formatter is its own component, because a
 * React Aria collection caches a row's element tree per record and a renderer
 * may call no hook.
 */
export const CustomerAwaitingTable = ({
  label,
  orders,
}: CustomerAwaitingTableProps): ReactElement => {
  const { t } = useTranslation('customer');

  const renderAwaitingRow = (order: CustomerAwaitingOrder): ReactElement => (
    <Table.Row
      id={order.customerOrderId}
      key={order.customerOrderId}
      textValue={order.itemSku}
    >
      <Table.Cell>
        <CustomerAwaitingItem order={order} />
      </Table.Cell>
      <Table.Cell className="text-right">
        <CustomerAwaitingQuantity order={order} />
      </Table.Cell>
      <Table.Cell>
        <CustomerAwaitingNeededBy order={order} />
      </Table.Cell>
      <Table.Cell>
        <CustomerAwaitingDestination destination={order.destination} />
      </Table.Cell>
    </Table.Row>
  );

  return (
    <Table className="mt-4 hidden lg:block" variant="secondary">
      <Table.ScrollContainer>
        <Table.Content aria-label={label}>
          <Table.Header>
            <Table.Column isRowHeader id="item">
              {t('detail.awaiting.item')}
            </Table.Column>
            {/* The figures are right-aligned so the column reads as one
                stack of comparable numbers, and its header goes with them —
                a heading that stays left of the values it names points at
                nothing (frame `KRDln`). */}
            <Table.Column className="text-right" id="outstanding">
              {t('detail.awaiting.outstanding')}
            </Table.Column>
            <Table.Column id="neededBy">
              {t('detail.awaiting.neededBy')}
            </Table.Column>
            <Table.Column id="goingTo">
              {t('detail.awaiting.goingTo')}
            </Table.Column>
          </Table.Header>
          <Table.Body items={orders}>{renderAwaitingRow}</Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
};
