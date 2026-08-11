import { useTranslation } from 'react-i18next';

import { DatasetCard } from 'shared/components/DatasetCard';

import type { AccessDataset } from 'modules/access/hooks/access-dataset';
import type { AccessMember } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';

/** Members while the administration list cannot be shown yet, or at all. */
export const MembersDatasetCard = ({
  dataset,
}: {
  dataset: AccessDataset<AccessMember>;
}): ReactElement => {
  const { t } = useTranslation('access');

  return (
    <DatasetCard
      empty={dataset.isReady && dataset.items.length === 0}
      emptyLabel={t('members.empty')}
      error={dataset.isError}
      errorLabel={t('members.error')}
      loading={dataset.isLoading}
      loadingLabel={`${t('members.heading')}…`}
      title={t('members.heading')}
    >
      <ul
        className="divide-y divide-border"
        aria-label={t('members.listLabel')}
      >
        {dataset.items.map((member) => (
          <li className="py-4 font-mono text-sm" key={member.userId}>
            {member.userId}
          </li>
        ))}
      </ul>
    </DatasetCard>
  );
};
