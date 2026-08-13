import { Button } from '@heroui/react';
import { useRouter } from '@tanstack/react-router';
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
  const router = useRouter();

  // `reset` alone only clears the React error boundary. The route match is
  // still in its error state, so it re-throws the same error and the actor
  // sees the identical screen — a control that appears to retry and does
  // nothing. Invalidating the router is what re-runs the failed `beforeLoad`,
  // which is the read CR-AC-08 asks to be retryable.
  const retry = (): void => {
    reset();
    void router.invalidate();
  };

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
      <Button variant="primary" onPress={retry}>
        {t('shell.landing.retry')}
      </Button>
    </div>
  );
};
