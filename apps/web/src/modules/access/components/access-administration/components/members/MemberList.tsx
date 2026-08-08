import {
  Button,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Skeleton,
} from '@heroui/react';
import { useTranslation } from 'react-i18next';

import {
  KebabIcon,
  KeyIcon,
  MailIcon,
  SearchIcon,
  TrashIcon,
} from 'shared/icons';

import type {
  AccessMember,
  AccessRole,
} from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

export type MemberListProps = {
  actorUserId: string;
  canDeleteMember: boolean;
  canEditEmail: boolean;
  canResetPassword: boolean;
  isLoading: boolean;
  members: AccessMember[];
  query: string;
  roles: AccessRole[];
  onDeleteMember: (member: AccessMember) => void;
  onEditEmail: (member: AccessMember) => void;
  onQueryChange: (query: string) => void;
  onResetPassword: (member: AccessMember) => void;
};

export const MemberList = ({
  actorUserId,
  canDeleteMember,
  canEditEmail,
  canResetPassword,
  isLoading,
  members,
  query,
  roles,
  onDeleteMember,
  onEditEmail,
  onQueryChange,
  onResetPassword,
}: MemberListProps): ReactElement => {
  const { t } = useTranslation('access');
  const roleNameById = new Map(roles.map((role) => [role.id, role.name]));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredMembers = members.filter((member) =>
    (member.email ?? '').toLocaleLowerCase().includes(normalizedQuery),
  );

  return (
    <div>
      <Input
        aria-label={t('members.search')}
        placeholder={t('members.search')}
        value={query}
        onValueChange={onQueryChange}
        classNames={{
          inputWrapper: 'h-12 border border-divider bg-content1 shadow-none',
        }}
        startContent={<SearchIcon />}
      />
      {isLoading ? (
        <div aria-label={t('members.loading')} className="mt-3 space-y-3">
          {[0, 1, 2].map((skeletonId) => (
            <Skeleton key={skeletonId} className="h-[72px] rounded-large" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <p className="mt-3 text-foreground-500">{t('members.empty')}</p>
      ) : filteredMembers.length === 0 ? (
        <p className="mt-3 text-foreground-500">{t('members.searchEmpty')}</p>
      ) : (
        <ul aria-label={t('members.listLabel')} className="mt-3 space-y-3">
          {filteredMembers.map((member) => {
            const isProtected = member.roleKind === 'warehouse_manager';
            const isSelf = member.userId === actorUserId;
            const hasAnyAction =
              canEditEmail || canResetPassword || canDeleteMember;
            const actionsLabel = t('members.actions', {
              email: member.email,
            });
            return (
              <li
                key={member.userId}
                aria-label={member.email}
                className="flex min-h-[72px] items-center justify-between gap-3 rounded-large border border-divider bg-content1 p-4"
              >
                <div>
                  <p className="font-semibold">{member.email}</p>
                  <p className="mt-1 text-sm text-foreground-500">
                    {roleNameById.get(member.roleId) ?? ''}
                  </p>
                </div>
                {isProtected ? (
                  <Chip color="primary" size="sm" variant="flat">
                    {t('roles.protected')}
                  </Chip>
                ) : isSelf ? (
                  <Chip size="sm" variant="flat">
                    {t('members.you')}
                  </Chip>
                ) : hasAnyAction ? (
                  <Dropdown>
                    <DropdownTrigger>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        aria-label={actionsLabel}
                      >
                        <KebabIcon />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label={actionsLabel}
                      onAction={(key) => {
                        if (key === 'editEmail') {
                          onEditEmail(member);
                        } else if (key === 'resetPassword') {
                          onResetPassword(member);
                        } else if (key === 'deleteMember') {
                          onDeleteMember(member);
                        }
                      }}
                    >
                      {canEditEmail ? (
                        <DropdownItem
                          key="editEmail"
                          startContent={<MailIcon />}
                        >
                          {t('members.menu.editEmail')}
                        </DropdownItem>
                      ) : null}
                      {canResetPassword ? (
                        <DropdownItem
                          key="resetPassword"
                          startContent={<KeyIcon />}
                        >
                          {t('members.menu.resetPassword')}
                        </DropdownItem>
                      ) : null}
                      {canDeleteMember ? (
                        <DropdownItem
                          key="deleteMember"
                          color="danger"
                          startContent={<TrashIcon />}
                        >
                          {t('members.menu.deleteMember')}
                        </DropdownItem>
                      ) : null}
                    </DropdownMenu>
                  </Dropdown>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
