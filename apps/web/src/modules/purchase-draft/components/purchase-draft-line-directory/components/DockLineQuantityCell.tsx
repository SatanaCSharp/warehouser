import type { PurchaseDraftLine } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

export type DockLineQuantityCellProps = {
  line: PurchaseDraftLine;
};

/**
 * The `Ordered` cell of `Delivery/Dock Line Row` (`DFncO`): how much was
 * ordered, group-separated for the reader's locale, with the unit it is
 * counted in beside it — a bare numeral answers "how much" only for whoever
 * already knows the unit.
 *
 * It is its own component because it reads a formatter, and a React Aria row
 * renderer may call no hook
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const DockLineQuantityCell = ({
  line,
}: DockLineQuantityCellProps): ReactElement => {
  const { quantity } = useLocaleFormat();

  return (
    <span className="block whitespace-nowrap">
      <span className="font-medium text-foreground">
        {quantity(line.orderedQuantity)}
      </span>{' '}
      <span className="text-sm text-muted">{line.unitOfMeasure}</span>
    </span>
  );
};
