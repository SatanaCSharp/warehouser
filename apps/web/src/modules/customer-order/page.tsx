import { useTranslation } from 'react-i18next';

import type { ReactElement } from 'react';

// T17 — minimal placeholder for the Demand destination the ordering web
// shell resolves. T18 owns the Demand table, the Customer Order sub-rows and
// their workflows (sad.md §5 Web); this shell task only proves the route
// resolves.
export const CustomerOrderPage = (): ReactElement => {
  const { t } = useTranslation('customer-order');

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold text-foreground">
        {t('head.title')}
      </h1>
    </main>
  );
};
