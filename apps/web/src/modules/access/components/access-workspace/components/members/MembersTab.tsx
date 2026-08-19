import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { CreateMemberAction } from 'modules/access/components/access-workspace/components/members/CreateMemberAction';
import { MemberDirectory } from 'modules/access/components/access-workspace/components/members/MemberDirectory';
import { MembersDatasetCard } from 'modules/access/components/access-workspace/components/members/MembersDatasetCard';
import { useAccessMembers } from 'modules/access/hooks/queries/useAccessMembers';
import { useHasPermission } from 'shared/hooks/queries/usePermissions';

import type { ReactElement } from 'react';

/**
 * Members tab body. Reading Members is enough for the administration list — it
 * hides the actions the actor cannot perform itself — so the read-only card
 * only stands in while the Members dataset is still on its way.
 *
 * Like `RolesTab`, the card is an alternative surface rather than a withheld
 * control, which is why the Permission is read here instead of gating
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 */
export const MembersTab = (): ReactElement => {
  const { t } = useTranslation('access');
  const canReadMembers = useHasPermission(PermissionId.USERS_WATCH);
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
