import type { Item } from '@warehouser/contracts/items';

/**
 * Which records name an Item, as the one name every sentence about it is keyed
 * by (`naming.row.*`, `naming.card.*`, `dialogs.deactivate.naming.*`,
 * `validation:itemSku.skuFixed.*`).
 *
 * `none` is the state AC-06c calls out by name: an Item nothing yet names may
 * still have its SKU corrected, so the copy for it says so rather than reading
 * as an absence.
 */
export type ItemNamingState = 'both' | 'lines' | 'none' | 'orders';

/**
 * Resolves an Item's naming state from the two counts the projection carries
 * (AC-06c, `packages/contracts/src/items/items-projections.ts`).
 *
 * The precedence is an ordered table rather than an `if`/`else if` chain
 * (`writing-web-components.md` §6): the first entry whose predicate holds wins,
 * and `orders` before `lines` is what makes "and" read in the order the frame
 * draws it (`XIvAZ.png`).
 */
const namingStates: readonly {
  state: ItemNamingState;
  holds: (item: Item) => boolean;
}[] = [
  {
    state: 'both',
    holds: ({ namingCustomerOrderCount, namingPurchaseDraftLineCount }) =>
      namingCustomerOrderCount > 0 && namingPurchaseDraftLineCount > 0,
  },
  {
    state: 'orders',
    holds: ({ namingCustomerOrderCount }) => namingCustomerOrderCount > 0,
  },
  {
    state: 'lines',
    holds: ({ namingPurchaseDraftLineCount }) =>
      namingPurchaseDraftLineCount > 0,
  },
];

export const itemNamingState = (item: Item): ItemNamingState =>
  namingStates.find(({ holds }) => holds(item))?.state ?? 'none';
