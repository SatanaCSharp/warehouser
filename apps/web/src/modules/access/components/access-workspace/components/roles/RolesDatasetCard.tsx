import type { AccessRole } from 'modules/access/types/access.types';
import type { AccessDataset } from 'modules/access/utils/access-dataset';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Conditional } from 'shared/components/Conditional';
import { DatasetCard } from 'shared/components/DatasetCard';

/** Read-only Roles, for an actor who may see them but not administer them. */
export const RolesDatasetCard = ({
  dataset,
}: {
  dataset: AccessDataset<AccessRole>;
}): ReactElement => {
  const { t } = useTranslation('access');

  return (
    <DatasetCard
      empty={dataset.items.length === 0}
      emptyLabel={t('roles.empty')}
      error={dataset.isError}
      errorLabel={t('roles.error')}
      title={t('roles.heading')}
    >
      <ul className="divide-y divide-border" aria-label={t('roles.listLabel')}>
        {dataset.items.map((role) => (
          <li className="py-4" key={role.id}>
            <span className="font-medium">{role.name}</span>
            <Conditional when={role.kind === 'warehouse_manager'}>
              <span className="ml-2 text-sm text-muted">
                {t('roles.protected')}
              </span>
            </Conditional>
          </li>
        ))}
      </ul>
    </DatasetCard>
  );
};
