import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type { CustomerAwaitingOrder } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';

export type CustomerAwaitingNeededByProps = {
  order: CustomerAwaitingOrder;
};

/**
 * The `Needed by` cell (`zw3n9`). `needed_by` is a calendar date, never an
 * instant (`customerAwaitingOrderSchema`), so it is rendered through the
 * calendar formatter rather than a timestamp one — the two disagree by a day
 * either side of midnight.
 */
export const CustomerAwaitingNeededBy = ({
  order,
}: CustomerAwaitingNeededByProps): ReactElement => {
  const { calendarDate } = useLocaleFormat();

  return (
    <span className="whitespace-nowrap text-foreground">
      {calendarDate(order.neededBy)}
    </span>
  );
};
