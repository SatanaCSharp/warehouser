import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { DatasetSkeleton } from 'shared/components/DatasetSkeleton';

/** The demand table's five presented columns, as the skeleton's bar widths. */
const DEMAND_COLUMNS = ['34%', '14%', '18%', '12%', '18%'] as const;

/**
 * What `customerOrderRoute` paints while its loader is awaiting the
 * consolidated demand (frame `hWFRW` tile `EZn9c`).
 *
 * It is the **route's** `pendingComponent`, because a destination's first-paint
 * readiness is the route's to own and no component below it asks a readiness
 * question (`frontend-architecture.md` §Route, §Page). It replaces the shared
 * centred spinner because the Demand destination has a shape worth drawing: the
 * skeleton is a table's worth of rows in the demand table's own column widths,
 * so the page does not visibly re-lay-out when the data lands.
 *
 * It is announced as "Loading demand" — the dataset, not the application — so a
 * member hears which destination is arriving.
 */
export const DemandPendingState = (): ReactElement => {
  const { t } = useTranslation('customer-order');

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <DatasetSkeleton columns={DEMAND_COLUMNS} label={t('demand.loading')} />
    </main>
  );
};
