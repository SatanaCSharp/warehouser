import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type { CustomerAwaitingOrder } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';

export type CustomerAwaitingQuantityProps = {
  order: CustomerAwaitingOrder;
};

/**
 * The `Outstanding` cell (`zw3n9`): what is still owed, group-separated as
 * every other quantity on the page is, **stacked over** the unit it is counted
 * in — a bare figure says nothing about what it counts, and the figure is what
 * the eye compares down the column, so it takes the emphasis and the line of
 * its own.
 *
 * Alignment is left to whatever renders it rather than fixed here: the desktop
 * column is right-aligned (`CustomerAwaitingTable` sets it on the column and
 * the cell, so both the figures and their header agree), while the mobile card
 * states the same two values under a left-aligned `Outstanding` label. The
 * stack inherits `text-align` from that container, so one component serves
 * both frames without a mode prop (`writing-web-components.md` §9).
 *
 * Its own component because it reads a formatter bound to the active locale,
 * and a row renderer may call no hook
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const CustomerAwaitingQuantity = ({
  order,
}: CustomerAwaitingQuantityProps): ReactElement => {
  const { quantity } = useLocaleFormat();

  return (
    <span className="flex flex-col whitespace-nowrap">
      <span className="font-semibold text-foreground">
        {quantity(order.outstandingQuantity)}
      </span>
      <span className="text-sm text-muted">{order.unitOfMeasure}</span>
    </span>
  );
};
