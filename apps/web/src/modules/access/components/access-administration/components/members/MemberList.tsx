import {
  Button,
  Chip,
  Dropdown,
  InputGroup,
  Label,
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
      <InputGroup className="h-12 border border-border bg-surface shadow-none">
        <InputGroup.Prefix>
          <SearchIcon />
        </InputGroup.Prefix>
        <InputGroup.Input
          aria-label={t('members.search')}
          placeholder={t('members.search')}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </InputGroup>
      {isLoading ? (
        <div aria-label={t('members.loading')} className="mt-3 space-y-3">
          {[0, 1, 2].map((skeletonId) => (
            <Skeleton key={skeletonId} className="h-[72px] rounded-xl" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <p className="mt-3 text-muted">{t('members.empty')}</p>
      ) : filteredMembers.length === 0 ? (
        <p className="mt-3 text-muted">{t('members.searchEmpty')}</p>
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
                className="flex min-h-[72px] items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <div>
                  <p className="font-semibold">{member.email}</p>
                  <p className="mt-1 text-sm text-muted">
                    {roleNameById.get(member.roleId) ?? ''}
                  </p>
                </div>
                {isProtected ? (
                  <Chip color="accent" size="sm" variant="soft">
                    {t('roles.protected')}
                  </Chip>
                ) : isSelf ? (
                  <Chip size="sm" variant="soft">
                    {t('members.you')}
                  </Chip>
                ) : hasAnyAction ? (
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
                      <Dropdown.Menu
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
                          <Dropdown.Item
                            id="editEmail"
                            textValue={t('members.menu.editEmail')}
                          >
                            <MailIcon />
                            <Label>{t('members.menu.editEmail')}</Label>
                          </Dropdown.Item>
                        ) : null}
                        {canResetPassword ? (
                          <Dropdown.Item
                            id="resetPassword"
                            textValue={t('members.menu.resetPassword')}
                          >
                            <KeyIcon />
                            <Label>{t('members.menu.resetPassword')}</Label>
                          </Dropdown.Item>
                        ) : null}
                        {canDeleteMember ? (
                          <Dropdown.Item
                            id="deleteMember"
                            variant="danger"
                            textValue={t('members.menu.deleteMember')}
                          >
                            <TrashIcon />
                            <Label>{t('members.menu.deleteMember')}</Label>
                          </Dropdown.Item>
                        ) : null}
                      </Dropdown.Menu>
                    </Dropdown.Popover>
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
