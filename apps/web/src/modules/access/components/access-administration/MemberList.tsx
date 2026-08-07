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

const SearchIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    className="size-5 text-foreground-400"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="m21 21-4.35-4.35m2.1-5.4a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
    />
  </svg>
);

const MailIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    className="size-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M2.25 6.75c0-.828.672-1.5 1.5-1.5h16.5c.828 0 1.5.672 1.5 1.5v10.5a1.5 1.5 0 0 1-1.5 1.5H3.75a1.5 1.5 0 0 1-1.5-1.5V6.75Zm0 0 9.75 6.75L21.75 6.75"
    />
  </svg>
);

const KeyIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    className="size-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M15.75 5.25a3 3 0 0 1 3 3v.184a3 3 0 0 1-.879 2.12l-7.34 7.342a3 3 0 0 1-2.122.879H6a1.5 1.5 0 0 1-1.5-1.5v-2.409a3 3 0 0 1 .879-2.121l7.342-7.341a3 3 0 0 1 2.121-.879h.908ZM15.75 5.25 18.75 8.25"
    />
  </svg>
);

const TrashIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    className="size-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="m14.74 9-.346 9m-4.788 0L9.26 9M19.228 5.79a48.108 48.108 0 0 0-3.478-.397m-12.68.397c1.153-.166 2.32-.298 3.5-.397m0 0a48.11 48.11 0 0 1 3.478-.397m7.5.794-.647 9.093a2.25 2.25 0 0 1-2.244 2.077H8.183a2.25 2.25 0 0 1-2.244-2.077L5.29 5.79m6.42-.797a48.667 48.667 0 0 1 3.478.397"
    />
  </svg>
);

const KebabIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    className="size-5"
    fill="currentColor"
    viewBox="0 0 24 24"
  >
    <circle cx="12" cy="5" r="1.75" />
    <circle cx="12" cy="12" r="1.75" />
    <circle cx="12" cy="19" r="1.75" />
  </svg>
);

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
