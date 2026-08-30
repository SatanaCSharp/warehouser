import { Conditional } from 'shared/components/Conditional';

import type { Item } from '@warehouser/contracts/items';
import type { ReactElement } from 'react';

export type ItemOnHandProps = {
  item: Item;
  /**
   * Whether the unit of measure is stated beside the figure. The table has a
   * unit column and the mobile card does not, so the card asks for it here
   * rather than restating the figure itself.
   */
  withUnit?: boolean;
};

/**
 * What an Item has on hand: the counted figure and, while one exists, the
 * reason its most recent adjustment was recorded.
 *
 * The reason is part of the contract this renders, not decoration (AC-08) — a
 * surface showing `42` without `Cycle count` is missing half the fact. Both the
 * table cell and the mobile card render it, so neither can drop the reason line
 * on its own.
 */
export const ItemOnHand = ({
  item,
  withUnit = false,
}: ItemOnHandProps): ReactElement => (
  <>
    <p>
      {withUnit
        ? `${item.onHandQuantity} ${item.unitOfMeasure}`
        : item.onHandQuantity}
    </p>
    <Conditional when={item.latestAdjustment}>
      <p className="text-sm text-muted">{item.latestAdjustment?.reason}</p>
    </Conditional>
  </>
);
