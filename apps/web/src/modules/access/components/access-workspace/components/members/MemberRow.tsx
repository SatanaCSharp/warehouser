import { Button, Chip, Dropdown, Label } from '@heroui/react';
import compact from 'lodash/compact';
import { useTranslation } from 'react-i18next';

import { KebabIcon, KeyIcon, MailIcon, TrashIcon } from 'shared/icons';

import type { AccessMember } from 'modules/access/types/access.types';
import type { Key, ReactElement, ReactNode } from 'react';

export type MemberRowProps = {
  canDeleteMember: boolean;
  canEditEmail: boolean;
  canResetPassword: boolean;
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
 */
export const MemberRow = ({
  canDeleteMember,
  canEditEmail,
  canResetPassword,
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

  const actions = compact<RowAction>([
    canEditEmail && {
      icon: <MailIcon />,
      id: 'editEmail',
      label: t('members.menu.editEmail'),
      run: () => onEditEmail(member),
    },
    canResetPassword && {
      icon: <KeyIcon />,
      id: 'resetPassword',
      label: t('members.menu.resetPassword'),
      run: () => onResetPassword(member),
    },
    canDeleteMember && {
      icon: <TrashIcon />,
      id: 'deleteMember',
      label: t('members.menu.deleteMember'),
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
