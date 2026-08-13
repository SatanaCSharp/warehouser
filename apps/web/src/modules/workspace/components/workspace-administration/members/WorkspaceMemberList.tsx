import { Skeleton } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { WorkspaceMemberRow } from 'modules/workspace/components/workspace-administration/members/WorkspaceMemberRow';
import { useWorkspaceRoles } from 'modules/workspace/hooks/useWorkspaceRoles';

import type { WorkspaceMember } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type WorkspaceMemberListProps = { members: WorkspaceMember[] };

/**
 * The people who administer this Workspace, each with the one Workspace Role
 * they hold. The Role name comes from the Workspace Roles read rather than from
 * the row, so a member row stays presentational and every row names a Role the
 * same way.
 */
export const WorkspaceMemberList = ({
  members,
}: WorkspaceMemberListProps): ReactElement => {
  const { t } = useTranslation('workspace');
  const { isReady, roles } = useWorkspaceRoles();

  // A row states the one Workspace Role its member holds, so the list waits for
  // the Roles read rather than rendering rows that name nothing for a heartbeat.
  if (!isReady) {
    return (
      <div aria-label={t('members.loading')} className="space-y-3">
        {[0, 1, 2].map((skeletonId) => (
          <Skeleton className="h-[72px] rounded-xl" key={skeletonId} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-sm font-semibold">{t('members.heading')}</h2>
      <p className="mt-1 text-sm text-muted">
        {t('members.description', { count: members.length })}
      </p>

      <ul aria-label={t('members.heading')} className="mt-3 space-y-3">
        {members.map((member) => (
          <WorkspaceMemberRow
            key={member.userId}
            member={member}
            roleName={
              roles.find((role) => role.id === member.workspaceRoleId)?.name
            }
          />
        ))}
      </ul>

      {members.length === 0 ? (
        <p className="mt-3 text-muted">{t('members.empty')}</p>
      ) : null}
    </div>
  );
};
