import { useTranslation } from 'react-i18next';

import { AccessWorkspace } from 'modules/access/components/access-workspace/AccessWorkspace';
import { useCurrentPermissions } from 'shared/hooks/queries/usePermissions';

import type { ReactElement } from 'react';

export const AccessPage = (): ReactElement => {
  const { t } = useTranslation('access');
  const { access, permissionIds } = useCurrentPermissions();

  const denied = (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold">{t('denied.heading')}</h1>
      <p className="mt-3 text-muted">{t('denied.description')}</p>
    </main>
  );

  // The workspace is a destination, not a control: an actor who holds no
  // Warehouse Permission at all is told why they are not in it, rather than
  // being shown nothing. Which parts of it they then get is each surface's own
  // gate to answer
  // (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
  if (!access || permissionIds.length === 0) {
    return denied;
  }

  return <AccessWorkspace />;
};

export default AccessPage;
