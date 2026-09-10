import type { CustomerOrder } from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

export type CustomerOrderOutstandingCellProps = { order: CustomerOrder };

/**
 * What one expanded Customer Order still waits for, against what it asked for
 * — `800 of 800 outstanding` (design frame `G6jhw`, sub-row). Both figures are
 * group-separated through `useLocaleFormat().quantity`.
 *
 * It is a component rather than markup inlined in the row renderer because it
 * calls two hooks, and a React Aria row renderer may call none
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const CustomerOrderOutstandingCell = ({
  order,
}: CustomerOrderOutstandingCellProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const format = useLocaleFormat();

  return (
    <span className="text-sm">
      {t('demand.customerOrder.outstanding', {
        outstanding: format.quantity(order.outstandingQuantity),
        quantity: format.quantity(order.quantity),
      })}
    </span>
  );
};
