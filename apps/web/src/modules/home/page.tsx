import { useTranslation } from 'react-i18next';

import type { ReactElement } from 'react';

// T4, T7 / CR-AC-18 — `/` stops being a dashboard. It is now the landing
// resolver (`guards/landing.guard.ts`), so this block renders only for an
// actor CR-AC-08 reaches rule (3) for: no Workspace administration authority
// and a null effective Warehouse. Every actor with a resolvable context is
// redirected away before it renders.
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
