import { useTranslation } from 'react-i18next';

import { useItemNaming } from 'modules/item/hooks/projections/useItemNaming';

import type { Item } from '@warehouser/contracts/items';
import type { ReactElement } from 'react';

export type ItemNamingLineProps = {
  item: Item;
};

/**
 * The second line of the Items table's description cell (frame `XIvAZ`):
 * `Named by 3 customer orders and 1 draft line`, or — for an Item nothing yet
 * names — `Nothing names it yet — its SKU is still correctable`.
 *
 * It is the destination's answer to AC-06c before a correction is attempted: a
 * member reading a row knows whether that Item's SKU can still be changed,
 * rather than finding out from a refusal. A deactivated Item adds the clause the
 * frame gives it, through the `naming.inactive` sentence rather than by
 * appending a second string to a first.
 *
 * It is a component rather than an expression inside the row renderer because a
 * React Aria row renderer may call no hook, and this reads translations
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const ItemNamingLine = ({ item }: ItemNamingLineProps): ReactElement => {
  const { t } = useTranslation('item');
  const { state, orders, lines } = useItemNaming(item);
  const naming = t(`naming.row.${state}`, { orders, lines });

  return (
    <p className="text-sm text-muted">
      {item.deactivatedAt === null ? naming : t('naming.inactive', { naming })}
    </p>
  );
};
