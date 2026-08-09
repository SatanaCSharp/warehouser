import { Spinner } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { AccessWorkspace } from 'modules/access/components/access-workspace/AccessWorkspace';
import { PermissionGate } from 'shared/components/PermissionGate';
import { useCurrentPermissions } from 'shared/hooks/usePermissions';

import type { ReactElement } from 'react';

export const AccessPage = (): ReactElement => {
  const { t } = useTranslation('access');
  const { access, isLoading } = useCurrentPermissions();

  if (isLoading) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-2">
        <Spinner />
        <span className="text-muted">{t('loading')}</span>
      </div>
    );
  }

  const denied = (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold">{t('denied.heading')}</h1>
      <p className="mt-3 text-muted">{t('denied.description')}</p>
    </main>
  );

  if (!access) {
    return denied;
  }

  return (
    <PermissionGate fallback={denied}>
      <AccessWorkspace access={access} />
    </PermissionGate>
  );
};

export default AccessPage;
