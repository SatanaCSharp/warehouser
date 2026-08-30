import { Button, Card } from '@heroui/react';

import { ItemOnHand } from 'modules/item/components/item-directory/components/ItemOnHand';
import { ItemStatusChip } from 'modules/item/components/item-directory/components/ItemStatusChip';
import { useItemActions } from 'modules/item/hooks/projections/useItemActions';

import type { Item } from '@warehouser/contracts/items';
import type { ItemActionHandlers } from 'modules/item/hooks/projections/useItemActions';
import type { ReactElement } from 'react';

export type ItemCardProps = ItemActionHandlers & {
  item: Item;
};

/**
 * One Item, carried as a card below the split-view breakpoint (design-handoff
 * `Item Card Mobile`, `QSHsy`). `ItemOnHand` and `ItemStatusChip` are the
 * leaves it shares with the table row, so the card cannot drop the adjustment
 * reason (AC-08) or state a different status (AC-06d).
 *
 * Its actions are inline rather than behind a kebab, as the approved frame has
 * them — a phone reaches the workflows without opening a menu first. They are
 * `Button`s with a semantic `variant` rather than the bare `<button>`s this
 * card used to render (`docs/system/guides/heroui-design-principles.md` §1),
 * and they come from the same `useItemActions` projection the table's menu
 * reads, so the two surfaces offer the same actor the same set.
 */
export const ItemCard = ({
  item,
  onAdjustOnHand,
  onCorrect,
  onToggleActive,
}: ItemCardProps): ReactElement => {
  const actions = useItemActions(item, {
    onAdjustOnHand,
    onCorrect,
    onToggleActive,
  });

  return (
    <li>
      <Card>
        <Card.Header className="flex flex-row items-start justify-between gap-2">
          <div>
            <Card.Title>{item.sku}</Card.Title>
            <Card.Description>{item.description}</Card.Description>
          </div>
          <ItemStatusChip item={item} />
        </Card.Header>

        <Card.Content>
          <ItemOnHand withUnit item={item} />
        </Card.Content>

        <Card.Footer className="flex flex-wrap gap-2">
          {actions.map(({ id, label, run }) => (
            <Button key={id} size="sm" variant="tertiary" onPress={run}>
              {label}
            </Button>
          ))}
        </Card.Footer>
      </Card>
    </li>
  );
};
