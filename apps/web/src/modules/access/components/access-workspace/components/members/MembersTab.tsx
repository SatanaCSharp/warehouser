import { PermissionId } from '@warehouser/shared-types/enums';
import { CreateMemberAction } from 'modules/access/components/access-workspace/components/members/CreateMemberAction';
import { MemberDirectory } from 'modules/access/components/access-workspace/components/members/MemberDirectory';
import { MembersDatasetCard } from 'modules/access/components/access-workspace/components/members/MembersDatasetCard';
import { useAccessMembers } from 'modules/access/hooks/queries/useAccessMembers';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useHasPermission } from 'shared/hooks/queries/usePermissions';

/**
 * Members tab body. Reading Members is enough for the administration list — it
 * hides the actions the actor cannot perform itself — so the read-only card
 * stands in only for an actor who may not read Members, and for one whose read
 * failed.
 *
 * Like `RolesTab`, the card is an alternative surface rather than a withheld
 * control, which is why the Permission is read here instead of gating
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 *
 * Readiness is not asked: the route awaits this dataset before the destination
 * mounts (CR-AC-04). The error arm stays explicit because the card is the only
 * renderer of the Members error — a permitted actor whose read failed must
 * reach it rather than a directory reporting that no Members exist (CR-AC-15).
 */
export const MembersTab = (): ReactElement => {
  const { t } = useTranslation('access');
  const canReadMembers = useHasPermission(PermissionId.USERS_WATCH);
  const members = useAccessMembers();

  if (!canReadMembers || members.isError) {
    return <MembersDatasetCard dataset={members} />;
  }

  return (
    <section aria-label={t('members.heading')}>
      <div className="mb-5 flex flex-wrap justify-end gap-2">
        <CreateMemberAction />
      </div>
      <MemberDirectory members={members.items} />
    </section>
  );
};
