import { useTranslation } from 'react-i18next';

import { AddWorkspaceMemberAction } from 'modules/access/components/workspace-administration/members/AddWorkspaceMemberAction';
import { WorkspaceMemberList } from 'modules/access/components/workspace-administration/members/WorkspaceMemberList';
import { WorkspaceUserList } from 'modules/access/components/workspace-administration/members/WorkspaceUserList';
import { WorkspaceListSkeleton } from 'modules/access/components/workspace-administration/WorkspaceListSkeleton';
import { useWorkspaceMembers } from 'modules/access/hooks/queries/useWorkspaceMembers';
import { useWorkspaceUsers } from 'modules/access/hooks/queries/useWorkspaceUsers';

import type { ReactElement } from 'react';

/**
 * The Workspace members tab: who administers this Workspace and in which
 * Workspace Role, followed by everyone else the Workspace can draw its next
 * member from (AC-19 – AC-22, AC-33).
 *
 * Both datasets are gated by `WORKSPACE_MEMBERS:WATCH` inside their own hooks,
 * so an actor without it fetches and retains neither. Neither pane renders
 * ahead of both reads: the candidate list depends on who is already a member,
 * so showing one before the other would state the wrong thing for a render.
 */
export const WorkspaceMembersTab = (): ReactElement => {
  const { t } = useTranslation('access');
  const members = useWorkspaceMembers();
  const users = useWorkspaceUsers();

  if (!members || !users) {
    return <WorkspaceListSkeleton label={t('workspaceMembers.loading')} />;
  }

  return (
    <section aria-label={t('workspaceMembers.heading')}>
      <div className="mb-5 flex flex-wrap justify-end gap-2">
        <AddWorkspaceMemberAction />
      </div>
      <WorkspaceMemberList members={members} />
      <WorkspaceUserList users={users} />
    </section>
  );
};
