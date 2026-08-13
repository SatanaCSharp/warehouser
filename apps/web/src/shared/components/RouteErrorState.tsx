import { Button } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { TriangleAlertIcon } from 'shared/icons';

import type { ErrorComponentProps } from '@tanstack/react-router';
import type { ReactElement } from 'react';

/**
 * The application's standard route error state. Matches TanStack Router's
 * `errorComponent` contract ({@link ErrorComponentProps}), so a route can
 * wire it in directly: `errorComponent: RouteErrorState`.
 *
 * CR-AC-08: a failed Workspace-context read renders this — a way to retry —
 * rather than the no-context state, because a failed read means the actor's
 * access is unknown, not that they have none.
 */
export const RouteErrorState = ({
  reset,
}: ErrorComponentProps): ReactElement => {
  const { t } = useTranslation('common');

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-danger [&_svg]:size-10">
        <TriangleAlertIcon />
      </span>
      <h1 className="text-xl font-semibold text-foreground">
        {t('shell.landing.errorHeading')}
      </h1>
      <p className="max-w-md text-muted">
        {t('shell.landing.errorDescription')}
      </p>
      <Button variant="primary" onPress={() => reset()}>
        {t('shell.landing.retry')}
      </Button>
    </div>
  );
};
