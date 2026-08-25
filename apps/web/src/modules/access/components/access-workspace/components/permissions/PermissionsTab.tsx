import { useTranslation } from 'react-i18next';

import { usePermissionLabel } from 'modules/access/hooks/projections/usePermissionLabel';
import { useAccessPermissions } from 'modules/access/hooks/queries/useAccessPermissions';
import { DatasetCard } from 'shared/components/DatasetCard';

import type { ReactElement } from 'react';

/** The read-only Permission catalogue every Role grants from. */
export const PermissionsTab = (): ReactElement => {
  const { t } = useTranslation('access');
  const permissions = useAccessPermissions();
  const permissionLabel = usePermissionLabel();

  return (
    <DatasetCard
      empty={permissions.items.length === 0}
      emptyLabel={t('permissions.empty')}
      error={permissions.isError}
      errorLabel={t('permissions.error')}
      title={t('permissions.heading')}
    >
      <ul
        className="divide-y divide-border"
        aria-label={t('permissions.listLabel')}
      >
        {permissions.items.map((permission) => (
          <li className="py-4" key={permission.id}>
            <span className="font-medium">{permissionLabel(permission)}</span>
            <span className="ml-2 text-sm text-muted">{permission.id}</span>
          </li>
        ))}
      </ul>
    </DatasetCard>
  );
};
