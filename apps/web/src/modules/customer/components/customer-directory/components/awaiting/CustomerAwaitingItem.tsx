import type { CustomerAwaitingOrder } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';

export type CustomerAwaitingItemProps = {
  order: CustomerAwaitingOrder;
};

/**
 * The `Item` cell of `Delivery/Awaiting Row` (`zw3n9`): the SKU above the
 * description, because a SKU alone identifies nothing to a member reading a
 * list of them and a description alone is not unique.
 *
 * Its own component rather than an expression in a cell: a React Aria
 * collection caches a row's element tree per record, so a cell renders a
 * component
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const CustomerAwaitingItem = ({
  order,
}: CustomerAwaitingItemProps): ReactElement => (
  <div>
    <p className="font-semibold text-foreground">{order.itemSku}</p>
    <p className="text-muted">{order.itemDescription}</p>
  </div>
);
