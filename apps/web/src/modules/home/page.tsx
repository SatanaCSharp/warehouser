import { useTranslation } from 'react-i18next';

import type { ReactElement } from 'react';

// T4 / CR-AC-18 — `/` stops being a dashboard. Until T7 adds the landing
// rules that redirect an actor with a resolvable context away from here,
// every actor sees this block, which is the expected intermediate state on
// this branch (T4's task record "Notes").
export const HomePage = (): ReactElement => {
  const { t } = useTranslation('common');

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="max-w-[560px] text-left">
        <h1 className="text-3xl font-semibold text-foreground">
          {t('shell.noContext.heading')}
        </h1>
        <p className="mt-3 text-muted">{t('shell.noContext.description')}</p>
      </div>
    </main>
  );
};
