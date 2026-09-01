import { ItemCard } from 'modules/item/components/item-directory/components/ItemCard';

import type { Item } from '@warehouser/contracts/items';
import type { ItemActionHandlers } from 'modules/item/hooks/projections/useItemActions';
import type { ReactElement } from 'react';

export type ItemCardListProps = ItemActionHandlers & {
  items: Item[];
  /** Names the list for assistive technology; the destination's heading. */
  label: string;
};

/**
 * The Items destination below the split-view breakpoint (design-handoff.md
 * `VHU6r`): one card per Item instead of a table row.
 *
 * Its cards read the same `useItemActions` projection the table's menu does,
 * so neither surface can offer the actor a set the other was not
 * (`writing-web-components.md` §4).
 */
export const ItemCardList = ({
  items,
  label,
  onAdjustOnHand,
  onCorrect,
  onDeactivate,
}: ItemCardListProps): ReactElement => {
  return (
    <ul aria-label={label} className="mt-4 grid gap-3 lg:hidden">
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          onAdjustOnHand={onAdjustOnHand}
          onCorrect={onCorrect}
          onDeactivate={onDeactivate}
        />
      ))}
    </ul>
  );
};
