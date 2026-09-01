import { useTranslation } from 'react-i18next';

import { DatasetSkeleton } from 'shared/components/DatasetSkeleton';

import type { ReactElement } from 'react';

/**
 * The Items table's column widths, so the placeholder rows have the shape of
 * the content arriving into them (frame `hWFRW` tile `EZn9c`): SKU, the wide
 * description-and-naming cell, the unit, the on-hand figure, the status chip.
 */
const ITEM_COLUMNS: readonly string[] = ['14%', '38%', '10%', '14%', '10%'];

/**
 * What `itemRoute` paints while it awaits the Items list.
 *
 * Readiness is the route's, not a component's (frontend-architecture.md §Page),
 * so this is the route's `pendingComponent` rather than a branch inside the
 * destination — and it draws the destination's own shape instead of the
 * centred spinner `RoutePendingState` gives a destination that has none.
 */
export const ItemPendingState = (): ReactElement => {
  const { t } = useTranslation('item');

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <DatasetSkeleton columns={ITEM_COLUMNS} label={t('directory.loading')} />
    </main>
  );
};
