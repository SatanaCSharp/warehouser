import { useTranslation } from 'react-i18next';

import { DemandDisclosureButton } from 'modules/customer-order/components/demand-directory/components/DemandDisclosureButton';
import { Conditional } from 'shared/components/Conditional';

import type { DemandLine } from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';

export type DemandItemCellProps = {
  /** Whether the row has Customer Orders to expand into. */
  hasChildItems: boolean;
  isExpanded: boolean;
  /** Whether this is the column React Aria puts the chevron in. */
  isTreeColumn: boolean;
  line: DemandLine;
};

/**
 * The `ITEM` cell of one Demand row (design frame `G6jhw`): the description on
 * the first line, then `WH-100420 · counted in pieces` and the disclosure
 * control on the second.
 *
 * The unit the Item is counted in is on the row because every quantity beside
 * it is read in that unit, and the frame states it once here rather than
 * repeating it in each numeric cell.
 *
 * It is a component rather than markup inlined in the row renderer because it
 * translates: a React Aria collection caches a row's element tree per record,
 * so a label resolved above it would keep the language that was active when the
 * row was first built
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const DemandItemCell = ({
  hasChildItems,
  isExpanded,
  isTreeColumn,
  line,
}: DemandItemCellProps): ReactElement => {
  const { t } = useTranslation('customer-order');

  return (
    <div>
      <p className="font-semibold text-foreground">{line.description}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>
          {t('demand.item.meta', {
            sku: line.sku,
            unit: line.unitOfMeasure,
          })}
        </span>
        <Conditional when={hasChildItems && isTreeColumn}>
          <DemandDisclosureButton isExpanded={isExpanded} line={line} />
        </Conditional>
      </div>
    </div>
  );
};
