import type { DemandLine } from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

export type DemandOutstandingCellProps = { line: DemandLine };

/**
 * The `OUTSTANDING` cell of one Demand row (design frame `G6jhw`): the
 * group-separated total above its unit of measure.
 *
 * The caption is the **unit alone** — `pieces`, not `pieces outstanding`. The
 * column header one line above already says `Outstanding`, so repeating the
 * word once per row said nothing a reader had not just read, and the unit is
 * the only part of that caption a row actually varies. The mobile card writes
 * the same caption the same way (`DemandCard`), so the two surfaces agree.
 *
 * The figure goes through `useLocaleFormat().quantity` rather than being
 * rendered raw, because every quantity in the approved frames is
 * group-separated (`1 240`) and an ungrouped one is a visible deviation.
 *
 * It is a component rather than markup inlined in the row renderer because it
 * calls a hook, and a React Aria row renderer may call none
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const DemandOutstandingCell = ({
  line,
}: DemandOutstandingCellProps): ReactElement => {
  const format = useLocaleFormat();

  return (
    <div className="text-right">
      <p className="font-semibold text-foreground">
        {format.quantity(line.totalOutstandingQuantity)}
      </p>
      <p className="text-xs text-muted">{line.unitOfMeasure}</p>
    </div>
  );
};
