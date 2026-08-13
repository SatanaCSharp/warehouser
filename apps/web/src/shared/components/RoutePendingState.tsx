import { Spinner } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import type { ReactElement } from 'react';

/**
 * The application's standard route pending state, matching TanStack Router's
 * `pendingComponent` contract so a route can wire it in directly:
 * `pendingComponent: RoutePendingState`.
 *
 * CR-AC-08: while the Workspace-context read is unresolved the actor remains
 * at the root and no rule is evaluated. This is what they see during that
 * window — never the no-context state, which is a resolved outcome (rule 3),
 * and never the error state, which means the read failed.
 */
export const RoutePendingState = (): ReactElement => {
  const { t } = useTranslation('common');

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <Spinner />
      <p className="text-muted">{t('shell.landing.pendingLabel')}</p>
    </div>
  );
};
