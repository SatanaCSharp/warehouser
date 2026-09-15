import type { Item } from '@warehouser/contracts/items';
import { useItemNaming } from 'modules/item/hooks/projections/useItemNaming';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export type ItemCardMetaProps = {
  item: Item;
};

/**
 * The mobile card's meta line (frame `VHU6r`):
 * `Counted in pieces · named by 3 customer orders and 1 draft line`.
 *
 * It carries the same two facts the desktop table splits across the `COUNTED IN`
 * column and the description cell's naming line, because a card has no columns
 * to put them in — so it is its own sentence rather than `ItemNamingLine` with a
 * flag, which would make both harder to read and neither translatable
 * (`writing-web-components.md` §9).
 */
export const ItemCardMeta = ({ item }: ItemCardMetaProps): ReactElement => {
  const { t } = useTranslation('item');
  const { state, orders, lines } = useItemNaming(item);
  const naming = t(`naming.card.${state}`, {
    unit: item.unitOfMeasure,
    orders,
    lines,
  });

  return (
    <p className="text-sm text-muted">
      {item.deactivatedAt === null ? naming : t('naming.inactive', { naming })}
    </p>
  );
};
