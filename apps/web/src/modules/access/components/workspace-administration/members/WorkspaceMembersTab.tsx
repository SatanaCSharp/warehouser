import { AddWorkspaceMemberAction } from 'modules/access/components/workspace-administration/members/AddWorkspaceMemberAction';
import { WorkspaceMemberList } from 'modules/access/components/workspace-administration/members/WorkspaceMemberList';
import { WorkspaceUserList } from 'modules/access/components/workspace-administration/members/WorkspaceUserList';
import { useWorkspaceMembers } from 'modules/access/hooks/queries/useWorkspaceMembers';
import { useWorkspaceUsers } from 'modules/access/hooks/queries/useWorkspaceUsers';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The Workspace members tab: who administers this Workspace and in which
 * Workspace Role, followed by everyone else the Workspace can draw its next
 * member from (AC-19 – AC-22, AC-33).
 *
 * Both datasets are gated by `WORKSPACE_MEMBERS:WATCH` inside their own hooks,
 * so an actor without it fetches and retains neither. It names no wait of its
 * own: `workspaceRoute`'s loader awaits both before the destination paints, so
 * neither pane can arrive after the tab (`global-loader/change.md` CH-08,
 * CH-14, `sad.md` §4.8).
 */
export const WorkspaceMembersTab = (): ReactElement => {
  const { t } = useTranslation('access');
  const members = useWorkspaceMembers();
  const users = useWorkspaceUsers();

  // Each pane reads the dataset it was given, so it is resolved here rather
  // than gated inline: `Conditional` evaluates both arms, and neither list
  // exists until its read has answered.
  //
  // `useWorkspaceMembers` and `useWorkspaceUsers` still report `undefined` for
  // a read that was skipped, failed or evicted, and defaulting that to `[]`
  // would state `workspaceMembers.empty` — "this workspace has no workspace
  // member yet" — about a Workspace nobody asked (CR-RG-05). An unanswered
  // read therefore states nothing, and the pane that has its answer states it.
  const memberList = !members ? null : (
    <WorkspaceMemberList members={members} />
  );
  const userList = !users ? null : <WorkspaceUserList users={users} />;

  return (
    <section aria-label={t('workspaceMembers.heading')}>
      <div className="mb-5 flex flex-wrap justify-end gap-2">
        <AddWorkspaceMemberAction />
      </div>
      {memberList}
      {userList}
    </section>
  );
};
