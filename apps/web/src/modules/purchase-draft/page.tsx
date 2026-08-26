import { useTranslation } from 'react-i18next';

import type { ReactElement } from 'react';

// T17 — minimal placeholder for the Purchase drafts destination the
// ordering web shell resolves. T19 owns the list-and-detail surface, the
// tabs and the arrival workflow (sad.md §5 Web); this shell task only proves
// the route resolves.
export const PurchaseDraftPage = (): ReactElement => {
  const { t } = useTranslation('purchase-draft');

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold text-foreground">
        {t('head.title')}
      </h1>
    </main>
  );
};
