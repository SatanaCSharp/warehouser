import { Button, Chip, Dropdown, Label } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { usePermittedItems } from 'shared/hooks/projections/usePermittedItems';
import { KebabIcon, KeyIcon, MailIcon, TrashIcon } from 'shared/icons';

import type { AccessMember } from 'modules/access/types/access.types';
import type { Key, ReactElement, ReactNode } from 'react';

export type MemberRowProps = {
  isSelf: boolean;
  member: AccessMember;
  roleName: string;
  onDeleteMember: (member: AccessMember) => void;
  onEditEmail: (member: AccessMember) => void;
  onResetPassword: (member: AccessMember) => void;
};

type RowAction = {
  icon: ReactNode;
  id: string;
  label: string;
  /** The Permission that offers this action (AC-30). */
  permission: PermissionId;
  variant?: 'danger';
  run: () => void;
};

/**
 * What the row carries on its trailing edge: a chip for a row that may not be
 * administered from here, otherwise the actions menu — and nothing at all for
 * an actor permissioned for none of them. The three cases are mutually
 * exclusive whole-component states, so they are early returns rather than the
 * ternary ladder they would otherwise be inside `MemberRow`'s JSX.
 */
const MemberRowTrailing = ({
  actions,
  actionsLabel,
  isProtected,
  isSelf,
}: {
  actions: RowAction[];
  actionsLabel: string;
  isProtected: boolean;
  isSelf: boolean;
}): ReactElement | null => {
  const { t } = useTranslation('access');

  if (isProtected) {
    return (
      <Chip color="accent" size="sm" variant="soft">
        {t('roles.protected')}
      </Chip>
    );
  }

  if (isSelf) {
    return (
      <Chip size="sm" variant="soft">
        {t('members.you')}
      </Chip>
    );
  }

  if (actions.length === 0) {
    return null;
  }

  const onAction = (key: Key): void => {
    actions.find((action) => action.id === key)?.run();
  };

  return (
    <Dropdown>
      <Button isIconOnly size="sm" variant="ghost" aria-label={actionsLabel}>
        <KebabIcon />
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu aria-label={actionsLabel} onAction={onAction}>
          {actions.map(({ icon, id, label, variant }) => (
            <Dropdown.Item id={id} key={id} textValue={label} variant={variant}>
              {icon}
              <Label>{label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
};

/**
 * One member of the Warehouse. The protected Warehouse Manager row and the
 * acting user's own row carry a chip instead of a menu — neither may be
 * administered from here (AC-11/13/14/18) — and the menu itself offers only
 * the actions the actor is permissioned for.
 *
 * `Dropdown.Menu` is a React Aria collection, so each action names the
 * Permission that offers it in its own descriptor and `usePermittedItems` drops
 * the rest — the collection form of `WarehousePermissionGate`
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`). The row reads
 * that itself: the authority to edit an email is not the list's to know.
 */
export const MemberRow = ({
  isSelf,
  member,
  roleName,
  onDeleteMember,
  onEditEmail,
  onResetPassword,
}: MemberRowProps): ReactElement => {
  const { t } = useTranslation('access');
  const isProtected = member.roleKind === 'warehouse_manager';
  const actionsLabel = t('members.actions', { email: member.email });

  const actions = usePermittedItems<RowAction>([
    {
      icon: <MailIcon />,
      id: 'editEmail',
      label: t('members.menu.editEmail'),
      permission: PermissionId.USERS_EMAIL_UPDATE,
      run: () => onEditEmail(member),
    },
    {
      icon: <KeyIcon />,
      id: 'resetPassword',
      label: t('members.menu.resetPassword'),
      permission: PermissionId.USERS_PASSWORD_CHANGE,
      run: () => onResetPassword(member),
    },
    {
      icon: <TrashIcon />,
      id: 'deleteMember',
      label: t('members.menu.deleteMember'),
      permission: PermissionId.USERS_DELETE,
      variant: 'danger',
      run: () => onDeleteMember(member),
    },
  ]);

  return (
    <li
      aria-label={member.email}
      className="flex min-h-[72px] items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <div>
        <p className="font-semibold">{member.email}</p>
        <p className="mt-1 text-sm text-muted">{roleName}</p>
      </div>

      <MemberRowTrailing
        actions={actions}
        actionsLabel={actionsLabel}
        isProtected={isProtected}
        isSelf={isSelf}
      />
    </li>
  );
};
