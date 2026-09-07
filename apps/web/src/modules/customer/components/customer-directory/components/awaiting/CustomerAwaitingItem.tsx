import { useTranslation } from 'react-i18next';

import type { CustomerAwaitingOrder } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';

export type CustomerAwaitingItemProps = {
  order: CustomerAwaitingOrder;
};

/**
 * The `Item` cell of `Delivery/Awaiting Row` (`zw3n9`): what the goods **are**
 * first, and what identifies them second — the description carries the
 * emphasis and the SKU sits under it beside the unit the line is counted in
 * (`WH-100420 · counted in pieces`).
 *
 * That order is the design's (frames `KRDln`, `b7gaH9`) and it is the reading
 * order too: a member scanning what a Customer awaits is looking for the
 * thing, and reaches for the SKU only once they have found it. The unit rides
 * here rather than only beside the figure so the row says what it counts even
 * where the outstanding column is off screen.
 *
 * Its own component rather than an expression in a cell: a React Aria
 * collection caches a row's element tree per record, so a cell renders a
 * component
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const CustomerAwaitingItem = ({
  order,
}: CustomerAwaitingItemProps): ReactElement => {
  const { t } = useTranslation('customer');

  return (
    <div>
      <p className="font-semibold text-foreground">{order.itemDescription}</p>
      <p className="text-sm text-muted">
        {t('detail.awaiting.itemMeta', {
          sku: order.itemSku,
          unit: order.unitOfMeasure,
        })}
      </p>
    </div>
  );
};
