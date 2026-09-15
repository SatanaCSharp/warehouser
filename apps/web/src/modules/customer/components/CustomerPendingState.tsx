import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { DatasetSkeleton } from 'shared/components/DatasetSkeleton';

/**
 * The Customers destination's own waiting shape (`okRzd` tile `yX9ZT`,
 * announced as "Loading customers"): the 340px list column beside the detail
 * pane, rather than the application-level spinner.
 *
 * Readiness is the route's, not a component's (frontend-architecture.md
 * §Page), so this is the route's `pendingComponent`.
 */
export const CustomerPendingState = (): ReactElement => {
  const { t } = useTranslation('customer');

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <DatasetSkeleton
        columns={['26%', '48%', '26%']}
        label={t('directory.loading')}
      />
    </main>
  );
};
