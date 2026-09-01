import { useTranslation } from 'react-i18next';

import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type { DemandLine } from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';

export type DemandOnHandCellProps = { line: DemandLine };

/**
 * The `ON HAND` cell of one Demand row (design frame `G6jhw`): the
 * group-separated figure above the caption `on hand`.
 *
 * It is a component rather than markup inlined in the row renderer because it
 * calls two hooks, and a React Aria row renderer may call none
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const DemandOnHandCell = ({
  line,
}: DemandOnHandCellProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const format = useLocaleFormat();

  return (
    <div className="text-right">
      <p className="font-semibold text-foreground">
        {format.quantity(line.onHandQuantity)}
      </p>
      <p className="text-xs text-muted">{t('demand.onHand.caption')}</p>
    </div>
  );
};
