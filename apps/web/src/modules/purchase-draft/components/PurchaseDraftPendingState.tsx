import { useTranslation } from 'react-i18next';

import { DatasetSkeleton } from 'shared/components/DatasetSkeleton';

import type { ReactElement } from 'react';

/** The card list's shape: a reference, a state chip, and the line under them. */
const CARD_BARS = ['45%', '25%'] as const;

/**
 * What the Purchase drafts destination paints while its route awaits the
 * drafts (frame `hWFRW` tile `EZn9c`).
 *
 * Route-level readiness is the route's to own
 * (`frontend-architecture.md` §Page), so this is the route's `pendingComponent`
 * rather than a readiness branch inside a component whose data the route
 * already awaited. It is drawn to the list column's own shape — a stack of
 * cards, not a table — so the wait reads as the destination arriving rather
 * than as a generic spinner.
 */
export const PurchaseDraftPendingState = (): ReactElement => {
  const { t } = useTranslation('purchase-draft');

  return (
    <main className="mx-auto max-w-[1440px] px-6 py-8">
      <h1 className="text-3xl font-semibold text-foreground">
        {t('workspace.heading')}
      </h1>
      <div className="mt-6 md:w-[340px]">
        <DatasetSkeleton
          columns={CARD_BARS}
          label={t('workspace.loading')}
          rows={3}
        />
      </div>
    </main>
  );
};
