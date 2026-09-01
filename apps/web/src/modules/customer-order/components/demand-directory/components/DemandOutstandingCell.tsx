import { useTranslation } from 'react-i18next';

import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type { DemandLine } from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';

export type DemandOutstandingCellProps = { line: DemandLine };

/**
 * The `OUTSTANDING` cell of one Demand row (design frame `G6jhw`): the
 * group-separated total above the unit caption `pieces outstanding`.
 *
 * The figure goes through `useLocaleFormat().quantity` rather than being
 * rendered raw, because every quantity in the approved frames is
 * group-separated (`1 240`) and an ungrouped one is a visible deviation.
 *
 * It is a component rather than markup inlined in the row renderer because it
 * calls two hooks, and a React Aria row renderer may call none
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const DemandOutstandingCell = ({
  line,
}: DemandOutstandingCellProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const format = useLocaleFormat();

  return (
    <div className="text-right">
      <p className="font-semibold text-foreground">
        {format.quantity(line.totalOutstandingQuantity)}
      </p>
      <p className="text-xs text-muted">
        {t('demand.outstanding.caption', { unit: line.unitOfMeasure })}
      </p>
    </div>
  );
};
