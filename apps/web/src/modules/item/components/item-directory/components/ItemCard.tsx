import { Card } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { ItemActionsMenu } from 'modules/item/components/item-directory/components/ItemActionsMenu';
import { ItemCardMeta } from 'modules/item/components/item-directory/components/ItemCardMeta';
import { ItemOnHand } from 'modules/item/components/item-directory/components/ItemOnHand';
import { ItemStatusChip } from 'modules/item/components/item-directory/components/ItemStatusChip';
import { ROW_ENTER } from 'shared/constants/motion';

import type { Item } from '@warehouser/contracts/items';
import type { ItemActionHandlers } from 'modules/item/hooks/projections/useItemActions';
import type { ReactElement } from 'react';

export type ItemCardProps = ItemActionHandlers & {
  item: Item;
};

/**
 * One Item, carried as a card below the split-view breakpoint (design-handoff
 * `Item Card Mobile`, `QSHsy`, frame `VHU6r`): SKU and status chip, the
 * description, the meta line naming the unit and what references the Item,
 * then the labelled `ON HAND` block with its reason line and the kebab.
 *
 * **Every value on the card is labelled or self-describing**, which the frame
 * requires and a bare figure does not satisfy: `60` alone says nothing, so the
 * on-hand block states what the figure is before stating it.
 *
 * `ItemOnHand`, `ItemStatusChip` and `ItemActionsMenu` are the leaves it shares
 * with the table row, so the card cannot drop the adjustment reason (AC-08),
 * state a different status (AC-06d), or offer a different set of actions than
 * the row's menu offers the same actor.
 */
export const ItemCard = ({
  item,
  onAdjustOnHand,
  onCorrect,
  onDeactivate,
}: ItemCardProps): ReactElement => {
  const { t } = useTranslation('item');

  return (
    <li className={ROW_ENTER}>
      <Card className={item.deactivatedAt === null ? undefined : 'opacity-60'}>
        <Card.Header className="flex flex-row items-start justify-between gap-2">
          <div>
            <Card.Title>{item.sku}</Card.Title>
            <Card.Description className="text-base font-medium text-foreground">
              {item.description}
            </Card.Description>
          </div>
          <ItemStatusChip item={item} />
        </Card.Header>

        <Card.Content>
          <ItemCardMeta item={item} />
        </Card.Content>

        <Card.Footer className="flex flex-row items-end justify-between gap-2 border-t border-border-secondary pt-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {t('directory.table.onHand')}
            </p>
            <ItemOnHand withUnit item={item} />
          </div>
          <ItemActionsMenu
            item={item}
            onAdjustOnHand={onAdjustOnHand}
            onCorrect={onCorrect}
            onDeactivate={onDeactivate}
          />
        </Card.Footer>
      </Card>
    </li>
  );
};
