import { Spinner } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useGetCurrentAccessQuery } from 'modules/access/api/access-api';
import { AccessWorkspace } from 'modules/access/components/access-workspace/AccessWorkspace';

import type { ReactElement } from 'react';

export const AccessPage = (): ReactElement => {
  const { t } = useTranslation('access');
  const currentAccess = useGetCurrentAccessQuery();

  if (currentAccess.isLoading) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-2">
        <Spinner />
        <span className="text-muted">{t('loading')}</span>
      </div>
    );
  }

  const access = currentAccess.data;
  const canReviewAccess = access?.permissionIds.some((permission) =>
    Object.values(PermissionId).includes(permission as PermissionId),
  );
  if (!access || !canReviewAccess) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold">{t('denied.heading')}</h1>
        <p className="mt-3 text-muted">{t('denied.description')}</p>
      </main>
    );
  }

  return <AccessWorkspace access={access} />;
};

export default AccessPage;
