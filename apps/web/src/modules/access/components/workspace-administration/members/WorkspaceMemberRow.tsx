import { Button, Chip, Dropdown, Label } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChangeWorkspaceRoleDialog } from 'modules/access/components/workspace-administration/members/ChangeWorkspaceRoleDialog';
import { RemoveWorkspaceMemberDialog } from 'modules/access/components/workspace-administration/members/RemoveWorkspaceMemberDialog';
import { TransferWorkspaceOwnershipDialog } from 'modules/access/components/workspace-administration/members/TransferWorkspaceOwnershipDialog';
import { Conditional } from 'shared/components/Conditional';
import { DialogHost } from 'shared/components/DialogHost';
import { useWorkspacePermittedItems } from 'shared/hooks/projections/useWorkspacePermittedItems';
import {
  ArrowRightLeftIcon,
  KebabIcon,
  ShieldIcon,
  TrashIcon,
} from 'shared/icons';

import type { WorkspaceMember } from '@warehouser/contracts/workspaces';
import type { Key, ReactElement, ReactNode } from 'react';

type WorkspaceMemberRowProps = {
  member: WorkspaceMember;
  roleName?: string;
};

/** Which per-Member dialog the row has opened. */
type WorkspaceMemberDialog =
  'changeRole' | 'removeMember' | 'transferOwnership';

type RowAction = {
  icon: ReactNode;
  id: WorkspaceMemberDialog;
  label: string;
  /** The Workspace Permission that offers this action (AC-30). */
  permission: WorkspacePermissionId;
  variant?: 'danger';
  run: () => void;
};

/**
 * What the row carries on its trailing edge: the `Protected` chip for the
 * Workspace Owner, and the actions menu for whatever the actor is permissioned
 * to run — nothing at all when that is none of them.
 *
 * The Owner keeps both: the chip states that the Role never changes here, and
 * the menu still carries the one workflow that may move it (AC-21a, AC-22,
 * AC-26). That is the single place this row departs from `MemberRow`, whose
 * protected row has no workflow left to offer.
 */
const WorkspaceMemberRowTrailing = ({
  actions,
  actionsLabel,
  isProtected,
}: {
  actions: RowAction[];
  actionsLabel: string;
  isProtected: boolean;
}): ReactElement | null => {
  const { t } = useTranslation('access');

  if (actions.length === 0 && !isProtected) {
    return null;
  }

  const onAction = (key: Key): void => {
    actions.find((action) => action.id === key)?.run();
  };

  return (
    <div className="flex items-center gap-2">
      <Conditional when={isProtected}>
        <Chip color="accent" size="sm" variant="soft">
          {t('workspaceMembers.chips.protected')}
        </Chip>
      </Conditional>

      <Conditional when={actions.length > 0}>
        <Dropdown>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={actionsLabel}
          >
            <KebabIcon />
          </Button>
          <Dropdown.Popover>
            <Dropdown.Menu aria-label={actionsLabel} onAction={onAction}>
              {actions.map(({ icon, id, label, variant }) => (
                <Dropdown.Item
                  id={id}
                  key={id}
                  textValue={label}
                  variant={variant}
                >
                  {icon}
                  <Label>{label}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </Conditional>
    </div>
  );
};

/**
 * One Workspace Member: who they are and the one Workspace Role they hold —
 * never a Warehouse Role, which this level does not read (AC-31, AC-33).
 *
 * The Workspace Owner's row offers the transfer instead of Change role and
 * Remove, because Workspace Owner changes only through that transfer (AC-21a,
 * AC-22). Each workflow names the Workspace Permission that offers it in its own
 * descriptor and `useWorkspacePermittedItems` drops the rest, because
 * `Dropdown.Menu` is a React Aria collection no gate element can sit inside
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`). So an actor
 * without a workflow's Permission is offered no menu item for it at all
 * (AC-30) — and an actor without the reserved `WORKSPACE_OWNER_ROLE:REASSIGN`
 * is offered no transfer anywhere (AC-27).
 */
export const WorkspaceMemberRow = ({
  member,
  roleName,
}: WorkspaceMemberRowProps): ReactElement => {
  const { t } = useTranslation('access');
  const [dialog, setDialog] = useState<WorkspaceMemberDialog | null>(null);
  const identity = member.email ?? member.userId;
  const isProtected = member.workspaceRoleKind === 'workspace_owner';
  const actionsLabel = t('members.actions', { email: identity });

  const onCloseDialog = (): void => setDialog(null);

  const onOpenDialog = (kind: WorkspaceMemberDialog) => (): void =>
    setDialog(kind);

  const ownerActions = useWorkspacePermittedItems<RowAction>([
    {
      icon: <ArrowRightLeftIcon />,
      id: 'transferOwnership',
      label: t('workspaceMembers.transferOwnership.trigger'),
      permission: WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN,
      run: onOpenDialog('transferOwnership'),
    },
  ]);

  const memberActions = useWorkspacePermittedItems<RowAction>([
    {
      icon: <ShieldIcon />,
      id: 'changeRole',
      label: t('workspaceMembers.changeRole.trigger'),
      permission: WorkspacePermissionId.WORKSPACE_ROLES_ASSIGN,
      run: onOpenDialog('changeRole'),
    },
    {
      icon: <TrashIcon />,
      id: 'removeMember',
      label: t('workspaceMembers.remove.trigger'),
      permission: WorkspacePermissionId.WORKSPACE_MEMBERS_REMOVE,
      variant: 'danger',
      run: onOpenDialog('removeMember'),
    },
  ]);

  // Every dialog reads the Member its row was opened for, so the open one is
  // resolved by a lookup here rather than gated inline: `Conditional` evaluates
  // both arms. A menu item is not a trigger the dialog can sit beside, so
  // `DialogHost` holds the open state the dialog closes itself through.
  const openDialog =
    dialog === null ? null : (
      <DialogHost onClose={onCloseDialog}>
        {
          {
            changeRole: <ChangeWorkspaceRoleDialog member={member} />,
            removeMember: <RemoveWorkspaceMemberDialog member={member} />,
            transferOwnership: <TransferWorkspaceOwnershipDialog />,
          }[dialog]
        }
      </DialogHost>
    );

  return (
    <li
      aria-label={identity}
      className="flex min-h-[72px] items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <div>
        <p className="font-semibold">{identity}</p>
        <p className="mt-1 text-sm text-muted">{roleName}</p>
      </div>

      <WorkspaceMemberRowTrailing
        actions={isProtected ? ownerActions : memberActions}
        actionsLabel={actionsLabel}
        isProtected={isProtected}
      />

      {openDialog}
    </li>
  );
};
