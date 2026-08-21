import { useTranslation } from 'react-i18next';

import { WorkspaceMemberRow } from 'modules/access/components/workspace-administration/members/WorkspaceMemberRow';
import { useWorkspaceRoles } from 'modules/access/hooks/queries/useWorkspaceRoles';
import { Conditional } from 'shared/components/Conditional';

import type { WorkspaceMember } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type WorkspaceMemberListProps = { members: WorkspaceMember[] };

/**
 * The people who administer this Workspace, each with the one Workspace Role
 * they hold. The Role name comes from the Workspace Roles read rather than from
 * the row, so a member row stays presentational and every row names a Role the
 * same way.
 *
 * It names no wait of its own. `workspaceRoute`'s loader awaits the Members and
 * the Roles together before the destination paints, so no row can render ahead
 * of the Role it names and the list has no heartbeat to hide
 * (`global-loader/change.md` CH-14, `sad.md` §4.8).
 */
export const WorkspaceMemberList = ({
  members,
}: WorkspaceMemberListProps): ReactElement => {
  const { t } = useTranslation('access');
  const { roles } = useWorkspaceRoles();

  return (
    <div>
      <h2 className="text-sm font-semibold">{t('workspaceMembers.heading')}</h2>
      <p className="mt-1 text-sm text-muted">
        {t('workspaceMembers.description', { count: members.length })}
      </p>

      <ul aria-label={t('workspaceMembers.heading')} className="mt-3 space-y-3">
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

      <Conditional when={members.length === 0}>
        <p className="mt-3 text-muted">{t('workspaceMembers.empty')}</p>
      </Conditional>
    </div>
  );
};
