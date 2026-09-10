import type { DemandLine } from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

export type DemandOnHandCellProps = { line: DemandLine };

/**
 * The `ON HAND` cell of one Demand row (design frame `G6jhw`): the
 * group-separated figure, and nothing else.
 *
 * It carries **no caption**. The column header one line above already says
 * `On hand`, and the unit is stated once per row by the `OUTSTANDING` cell
 * beside it — a Demand Line counts both figures in the same unit, so naming it
 * twice on one row is noise rather than clarification. The mobile card still
 * labels this figure, because a card has no column header to read it from.
 *
 * It is a component rather than markup inlined in the row renderer because it
 * calls a hook, and a React Aria row renderer may call none
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const DemandOnHandCell = ({
  line,
}: DemandOnHandCellProps): ReactElement => {
  const format = useLocaleFormat();

  return (
    <div className="text-right">
      <p className="font-semibold text-foreground">
        {format.quantity(line.onHandQuantity)}
      </p>
    </div>
  );
};
