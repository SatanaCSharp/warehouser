import { InputGroup, Skeleton } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MemberRow } from 'modules/access/components/access-workspace/components/members/MemberRow';
import { SearchIcon } from 'shared/icons';

import type {
  AccessMember,
  AccessRole,
} from 'modules/access/types/access.types';
import type { ChangeEvent, ReactElement, ReactNode } from 'react';

/** Which of the list's four mutually exclusive states is on screen. */
type MemberListStatus = 'empty' | 'loading' | 'ready' | 'searchEmpty';

const MemberListBody = ({
  children,
  status,
}: {
  children: ReactNode;
  status: MemberListStatus;
}): ReactElement => {
  const { t } = useTranslation('access');

  if (status === 'loading') {
    return (
      <div aria-label={t('members.loading')} className="mt-3 space-y-3">
        {[0, 1, 2].map((skeletonId) => (
          <Skeleton key={skeletonId} className="h-[72px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (status === 'empty') {
    return <p className="mt-3 text-muted">{t('members.empty')}</p>;
  }

  if (status === 'searchEmpty') {
    return <p className="mt-3 text-muted">{t('members.searchEmpty')}</p>;
  }

  return (
    <ul aria-label={t('members.listLabel')} className="mt-3 space-y-3">
      {children}
    </ul>
  );
};

export type MemberListProps = {
  actorUserId: string;
  canDeleteMember: boolean;
  canEditEmail: boolean;
  canResetPassword: boolean;
  isLoading: boolean;
  members: AccessMember[];
  roles: AccessRole[];
  onDeleteMember: (member: AccessMember) => void;
  onEditEmail: (member: AccessMember) => void;
  onResetPassword: (member: AccessMember) => void;
};

/**
 * The searchable member list. The search term is local — nothing outside this
 * list reads it — and each row decides its own controls from what it is handed.
 */
export const MemberList = ({
  actorUserId,
  canDeleteMember,
  canEditEmail,
  canResetPassword,
  isLoading,
  members,
  roles,
  onDeleteMember,
  onEditEmail,
  onResetPassword,
}: MemberListProps): ReactElement => {
  const { t } = useTranslation('access');
  const [query, setQuery] = useState('');

  const onChangeQuery = (event: ChangeEvent<HTMLInputElement>): void =>
    setQuery(event.target.value);
  const roleNameById = new Map(roles.map((role) => [role.id, role.name]));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleMembers = members.filter((member) =>
    (member.email ?? '').toLocaleLowerCase().includes(normalizedQuery),
  );

  const status = (): MemberListStatus => {
    if (isLoading) {
      return 'loading';
    }
    if (members.length === 0) {
      return 'empty';
    }
    return visibleMembers.length === 0 ? 'searchEmpty' : 'ready';
  };

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
          onChange={onChangeQuery}
        />
      </InputGroup>

      <MemberListBody status={status()}>
        {visibleMembers.map((member) => (
          <MemberRow
            key={member.userId}
            canDeleteMember={canDeleteMember}
            canEditEmail={canEditEmail}
            canResetPassword={canResetPassword}
            isSelf={member.userId === actorUserId}
            member={member}
            roleName={roleNameById.get(member.roleId) ?? ''}
            onDeleteMember={onDeleteMember}
            onEditEmail={onEditEmail}
            onResetPassword={onResetPassword}
          />
        ))}
      </MemberListBody>
    </div>
  );
};
