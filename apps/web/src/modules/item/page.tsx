import { useTranslation } from 'react-i18next';

import type { ReactElement } from 'react';

// T17 — minimal placeholder for the Items destination the ordering web
// shell resolves. T20 owns the Item table, on-hand figure and its dialogs
// (sad.md §5 Web); this shell task only proves the route resolves.
export const ItemPage = (): ReactElement => {
  const { t } = useTranslation('item');

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold text-foreground">
        {t('head.title')}
      </h1>
    </main>
  );
};
