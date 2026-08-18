import { useTranslation } from 'react-i18next';

import { CreateMemberAction } from 'modules/access/components/access-workspace/components/members/CreateMemberAction';
import { MemberDirectory } from 'modules/access/components/access-workspace/components/members/MemberDirectory';
import { MembersDatasetCard } from 'modules/access/components/access-workspace/components/members/MembersDatasetCard';
import { useAccessCapabilities } from 'modules/access/hooks/projections/useAccessCapabilities';
import { useAccessMembers } from 'modules/access/hooks/queries/useAccessMembers';

import type { ReactElement } from 'react';

/**
 * Members tab body. Reading Members is enough for the administration list — it
 * hides the actions the actor cannot perform itself — so the read-only card
 * only stands in while the Members dataset is still on its way.
 */
export const MembersTab = (): ReactElement => {
  const { t } = useTranslation('access');
  const { canReadMembers } = useAccessCapabilities();
  const members = useAccessMembers();

  if (!canReadMembers || !members.isReady) {
    return <MembersDatasetCard dataset={members} />;
  }

  return (
    <section aria-label={t('members.heading')}>
      <div className="mb-5 flex flex-wrap justify-end gap-2">
        <CreateMemberAction />
      </div>
      <MemberDirectory
        isRefreshing={members.isFetching}
        members={members.items}
      />
    </section>
  );
};
