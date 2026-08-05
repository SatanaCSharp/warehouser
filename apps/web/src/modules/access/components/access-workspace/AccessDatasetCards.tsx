import { useTranslation } from 'react-i18next';

import { DatasetCard } from 'shared/components/DatasetCard';

import type {
  MemberPage,
  PermissionPage,
  RolePage,
} from '@warehouser/contracts/access';
import type { ReactElement } from 'react';

type DatasetQuery<T> = {
  data?: { items: T[] };
  isError: boolean;
  isLoading: boolean;
};

export const RolesDatasetCard = ({
  query,
}: {
  query: DatasetQuery<RolePage['items'][number]>;
}): ReactElement => {
  const { t } = useTranslation('access');
  return (
    <DatasetCard
      empty={query.data?.items.length === 0}
      emptyLabel={t('roles.empty')}
      error={query.isError}
      errorLabel={t('roles.error')}
      loading={query.isLoading}
      loadingLabel={`${t('roles.heading')}…`}
      title={t('roles.heading')}
    >
      <ul className="divide-y divide-divider" aria-label={t('roles.listLabel')}>
        {query.data?.items.map((role) => (
          <li className="py-4" key={role.id}>
            <span className="font-medium">{role.name}</span>
            {role.kind === 'warehouse_manager' ? (
              <span className="ml-2 text-sm text-foreground-500">
                {t('roles.protected')}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </DatasetCard>
  );
};

export const MembersDatasetCard = ({
  query,
}: {
  query: DatasetQuery<MemberPage['items'][number]>;
}): ReactElement => {
  const { t } = useTranslation('access');
  return (
    <DatasetCard
      empty={query.data?.items.length === 0}
      emptyLabel={t('members.empty')}
      error={query.isError}
      errorLabel={t('members.error')}
      loading={query.isLoading}
      loadingLabel={`${t('members.heading')}…`}
      title={t('members.heading')}
    >
      <ul
        className="divide-y divide-divider"
        aria-label={t('members.listLabel')}
      >
        {query.data?.items.map((member) => (
          <li className="py-4 font-mono text-sm" key={member.userId}>
            {member.userId}
          </li>
        ))}
      </ul>
    </DatasetCard>
  );
};

export const PermissionsDatasetCard = ({
  query,
}: {
  query: DatasetQuery<PermissionPage['items'][number]>;
}): ReactElement => {
  const { t } = useTranslation('access');
  return (
    <DatasetCard
      empty={query.data?.items.length === 0}
      emptyLabel={t('permissions.empty')}
      error={query.isError}
      errorLabel={t('permissions.error')}
      loading={query.isLoading}
      loadingLabel={`${t('permissions.heading')}…`}
      title={t('permissions.heading')}
    >
      <ul
        className="divide-y divide-divider"
        aria-label={t('permissions.listLabel')}
      >
        {query.data?.items.map((permission) => (
          <li className="py-4" key={permission.id}>
            <span className="font-medium">{permission.label}</span>
            <span className="ml-2 text-sm text-foreground-500">
              {permission.id}
            </span>
          </li>
        ))}
      </ul>
    </DatasetCard>
  );
};
