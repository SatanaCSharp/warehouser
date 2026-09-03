import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type { CustomerAwaitingOrder } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';

export type CustomerAwaitingQuantityProps = {
  order: CustomerAwaitingOrder;
};

/**
 * The `Outstanding` cell (`zw3n9`): what is still owed, group-separated as
 * every other quantity on the page is, followed by the unit it is counted in —
 * a bare figure says nothing about what it counts.
 *
 * Its own component because it reads a formatter bound to the active locale,
 * and a row renderer may call no hook
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const CustomerAwaitingQuantity = ({
  order,
}: CustomerAwaitingQuantityProps): ReactElement => {
  const { quantity } = useLocaleFormat();

  return (
    <span className="whitespace-nowrap text-foreground">
      {quantity(order.outstandingQuantity)} {order.unitOfMeasure}
    </span>
  );
};
