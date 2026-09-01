import { useTranslation } from 'react-i18next';

import { itemNamingState } from 'modules/item/utils/item-naming';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type { Item } from '@warehouser/contracts/items';
import type { ItemNamingState } from 'modules/item/utils/item-naming';

export type ItemNaming = {
  /** Which sentence to reach for; the key suffix of every naming copy group. */
  state: ItemNamingState;
  /** The pluralized Customer Order count — `3 customer orders`. */
  orders: string;
  /** The pluralized Purchase Draft Line count — `1 draft line`. */
  lines: string;
};

/**
 * What names an Item, already stated in the reader's language (AC-06c).
 *
 * The two counts are pluralized through i18next rather than assembled from a
 * number and a noun, because `uk` has three plural forms where `en` has two —
 * so the phrase a sentence interpolates is resolved here, once, and the four
 * surfaces that say something about naming (the table row, the mobile card, the
 * deactivation dialog and the SKU refusal) each interpolate it into their own
 * whole sentence rather than concatenating one.
 *
 * `count` selects the plural form and `formatted` is what the sentence renders:
 * i18next interpolates a raw numeral, and no ungrouped number may reach the
 * page (design-handoff.md § Numbers).
 */
export const useItemNaming = (item: Item): ItemNaming => {
  const { t } = useTranslation('item');
  const format = useLocaleFormat();

  return {
    state: itemNamingState(item),
    orders: t('naming.orders', {
      count: item.namingCustomerOrderCount,
      formatted: format.quantity(item.namingCustomerOrderCount),
    }),
    lines: t('naming.lines', {
      count: item.namingPurchaseDraftLineCount,
      formatted: format.quantity(item.namingPurchaseDraftLineCount),
    }),
  };
};
