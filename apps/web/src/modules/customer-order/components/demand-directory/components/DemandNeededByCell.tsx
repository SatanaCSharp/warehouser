import { DemandUrgencyChip } from 'modules/customer-order/components/demand-directory/components/DemandUrgencyChip';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type { DemandLine } from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';

export type DemandNeededByCellProps = { line: DemandLine };

/**
 * The `EARLIEST NEEDED BY` cell of one Demand row (design frame `G6jhw`): the
 * date as `2 Sep 2026`, and below it the urgency chip that says how long is
 * left or how long the date has been past.
 *
 * `whitespace-nowrap` is what widens the column. The table lays its columns
 * out from their content, so the longest chip a row can carry — `overdue by 6
 * days` — decided the width, and at its natural minimum that chip broke across
 * two lines and drew the row taller than the date beside it. Refusing the break
 * makes the chip's own single-line width the column's minimum, which is the
 * width the frame draws. It is set here rather than on the chip because the
 * date must not break either, and `white-space` inherits.
 *
 * The date is rendered through `useLocaleFormat().calendarDate`, never as the
 * raw ISO string the contract carries — no frame draws one anywhere.
 *
 * It is a component rather than markup inlined in the row renderer because it
 * calls a hook, and a React Aria row renderer may call none
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const DemandNeededByCell = ({
  line,
}: DemandNeededByCellProps): ReactElement => {
  const format = useLocaleFormat();

  return (
    <div className="flex flex-col items-start gap-1 whitespace-nowrap">
      <span className="text-foreground">
        {format.calendarDate(line.earliestNeededBy)}
      </span>
      <DemandUrgencyChip neededBy={line.earliestNeededBy} />
    </div>
  );
};
