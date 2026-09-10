import type { Item } from '@warehouser/contracts/items';
import { CreateItemAction } from 'modules/item/components/item-directory/components/CreateItemAction';
import { ItemCardList } from 'modules/item/components/item-directory/components/ItemCardList';
import { ItemSearchField } from 'modules/item/components/item-directory/components/ItemSearchField';
import { ItemSkuNote } from 'modules/item/components/item-directory/components/ItemSkuNote';
import { ItemTable } from 'modules/item/components/item-directory/components/ItemTable';
import type { ItemActionHandlers } from 'modules/item/hooks/projections/useItemActions';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Conditional } from 'shared/components/Conditional';
import { DatasetEmptyState } from 'shared/components/DatasetEmptyState';
import { PackageIcon } from 'shared/icons';

export type ItemCatalogueProps = ItemActionHandlers & {
  items: Item[];
};

/** Which of the collection's three mutually exclusive states is on screen. */
type ItemCatalogueState = 'empty' | 'noMatches' | 'ready';

/** The states that displace the rows, most significant first. */
const displacingStates: readonly {
  state: ItemCatalogueState;
  holds: (reading: { itemCount: number; matchCount: number }) => boolean;
}[] = [
  { state: 'empty', holds: ({ itemCount }) => itemCount === 0 },
  { state: 'noMatches', holds: ({ matchCount }) => matchCount === 0 },
];

/**
 * The Items collection and everything a member reads it through: the search
 * field, the `Add item` action beside it, the two responsive surfaces, the
 * state that displaces them, and the SKU note underneath (frames `XIvAZ`,
 * `VHU6r`).
 *
 * The search term lives here and nowhere higher, because nothing outside this
 * collection reads it (`writing-web-components.md` §8), and it filters the list
 * the route already loaded rather than issuing a request — see
 * `ItemSearchField` for why that is the right answer at this feature's stated
 * scale.
 *
 * Which of the three states is on screen is resolved to a **name** and rendered
 * through a total `Record<State, ReactElement>` lookup, so adding a state
 * fails to compile until it is answered (`writing-web-components.md` §6).
 */
export const ItemCatalogue = ({
  items,
  onAdjustOnHand,
  onCorrect,
  onDeactivate,
}: ItemCatalogueProps): ReactElement => {
  const { t } = useTranslation('item');
  const [query, setQuery] = useState('');
  const heading = t('directory.heading');

  const term = query.trim().toLocaleLowerCase();
  const matches = items.filter((item) =>
    `${item.sku} ${item.description}`.toLocaleLowerCase().includes(term),
  );
  const state =
    displacingStates.find(({ holds }) =>
      holds({ itemCount: items.length, matchCount: matches.length }),
    )?.state ?? 'ready';

  const content: Record<ItemCatalogueState, ReactElement> = {
    empty: (
      <DatasetEmptyState
        action={<CreateItemAction />}
        description={t('directory.empty.description')}
        heading={t('directory.empty.heading')}
        icon={<PackageIcon />}
      />
    ),
    noMatches: (
      <p className="mt-6 text-muted" role="status">
        {t('directory.empty.noMatches', { query: query.trim() })}
      </p>
    ),
    ready: (
      <>
        <ItemTable
          items={matches}
          label={heading}
          onAdjustOnHand={onAdjustOnHand}
          onCorrect={onCorrect}
          onDeactivate={onDeactivate}
        />
        <ItemCardList
          items={matches}
          label={heading}
          onAdjustOnHand={onAdjustOnHand}
          onCorrect={onCorrect}
          onDeactivate={onDeactivate}
        />
      </>
    ),
  };

  return (
    <div>
      {/* A Warehouse dealing in nothing has nothing to search and one thing to
          do, so the empty state carries the only `Add item` on screen rather
          than a second one competing with the toolbar's. */}
      <Conditional when={state !== 'empty'}>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ItemSearchField value={query} onChange={setQuery} />
          <CreateItemAction />
        </div>
      </Conditional>

      {content[state]}
      <ItemSkuNote />
    </div>
  );
};
