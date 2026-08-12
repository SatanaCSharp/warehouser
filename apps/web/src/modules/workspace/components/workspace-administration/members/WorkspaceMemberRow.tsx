import { Avatar, Chip } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { ChangeWorkspaceRoleAction } from 'modules/workspace/components/workspace-administration/members/ChangeWorkspaceRoleAction';
import { RemoveWorkspaceMemberAction } from 'modules/workspace/components/workspace-administration/members/RemoveWorkspaceMemberAction';
import { TransferWorkspaceOwnershipAction } from 'modules/workspace/components/workspace-administration/members/TransferWorkspaceOwnershipAction';

import type { WorkspaceMember } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type WorkspaceMemberRowProps = {
  member: WorkspaceMember;
  roleName?: string;
};

/**
 * One Workspace Member: who they are and the one Workspace Role they hold —
 * never a Warehouse Role, which this level does not read (AC-31, AC-33).
 *
 * The Workspace Owner's row is the protection: it carries `Protected` and
 * offers the transfer instead of Change role and Remove, because Workspace
 * Owner changes only through that transfer (AC-21a, AC-22). Each action decides
 * for itself whether the actor may use it, so this row states no capability.
 */
export const WorkspaceMemberRow = ({
  member,
  roleName,
}: WorkspaceMemberRowProps): ReactElement => {
  const { t } = useTranslation('workspace');
  const identity = member.email ?? member.userId;

  return (
    <li
      aria-label={identity}
      className="flex min-h-[72px] flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex items-center gap-3">
        <Avatar>
          <Avatar.Fallback>
            {identity.slice(0, 1).toLocaleUpperCase()}
          </Avatar.Fallback>
        </Avatar>
        <div>
          <p className="font-semibold">{identity}</p>
          <p className="mt-1 text-sm text-muted">{roleName}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {member.workspaceRoleKind === 'workspace_owner' ? (
          <>
            <Chip color="accent" size="sm" variant="soft">
              {t('members.chips.protected')}
            </Chip>
            <TransferWorkspaceOwnershipAction />
          </>
        ) : (
          <>
            <ChangeWorkspaceRoleAction member={member} />
            <RemoveWorkspaceMemberAction member={member} />
          </>
        )}
      </div>
    </li>
  );
};
