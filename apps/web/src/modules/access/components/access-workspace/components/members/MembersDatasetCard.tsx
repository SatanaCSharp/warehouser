import type { AccessMember } from 'modules/access/types/access.types';
import type { AccessDataset } from 'modules/access/utils/access-dataset';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { DatasetCard } from 'shared/components/DatasetCard';

/** Members while the administration list cannot be shown yet, or at all. */
export const MembersDatasetCard = ({
  dataset,
}: {
  dataset: AccessDataset<AccessMember>;
}): ReactElement => {
  const { t } = useTranslation('access');

  return (
    <DatasetCard
      empty={dataset.items.length === 0}
      emptyLabel={t('members.empty')}
      error={dataset.isError}
      errorLabel={t('members.error')}
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
