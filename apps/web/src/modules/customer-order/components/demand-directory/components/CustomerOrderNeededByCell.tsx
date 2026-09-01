import { useTranslation } from 'react-i18next';

import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type { CustomerOrder } from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';

export type CustomerOrderNeededByCellProps = { order: CustomerOrder };

/**
 * When one expanded Customer Order needs its goods — `by 2 Sep 2026` (design
 * frame `G6jhw`, sub-row). Rendered through
 * `useLocaleFormat().calendarDate`, never as the raw ISO date the contract
 * carries.
 *
 * It is a component rather than markup inlined in the row renderer because it
 * calls two hooks, and a React Aria row renderer may call none
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const CustomerOrderNeededByCell = ({
  order,
}: CustomerOrderNeededByCellProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const format = useLocaleFormat();

  return (
    <span className="text-sm">
      {t('demand.customerOrder.neededBy', {
        date: format.calendarDate(order.neededBy),
      })}
    </span>
  );
};
