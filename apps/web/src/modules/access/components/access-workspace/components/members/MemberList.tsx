import { InputGroup } from '@heroui/react';
import { MemberRow } from 'modules/access/components/access-workspace/components/members/MemberRow';
import type {
  AccessMember,
  AccessRole,
} from 'modules/access/types/access.types';
import type { ChangeEvent, ReactElement, ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchIcon } from 'shared/icons';

/** Which of the list's three mutually exclusive states is on screen. */
type MemberListStatus = 'empty' | 'ready' | 'searchEmpty';

const MemberListBody = ({
  children,
  status,
}: {
  children: ReactNode;
  status: MemberListStatus;
}): ReactElement => {
  const { t } = useTranslation('access');

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
  /**
   * The acting user, or `undefined` while the auth store has not resolved one.
   * Undefined is not defaulted away: a fallback id would compare unequal to
   * every member and render every row as somebody else's (CR-RG-01).
   */
  actorUserId: string | undefined;
  members: AccessMember[];
  roles: AccessRole[];
  onDeleteMember: (member: AccessMember) => void;
  onEditEmail: (member: AccessMember) => void;
  onResetPassword: (member: AccessMember) => void;
};

/**
 * The searchable member list. The search term is local — nothing outside this
 * list reads it — and each row decides for itself which of its actions the
 * actor may run, so no capability travels through this file.
 */
export const MemberList = ({
  actorUserId,
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
            actorUserId={actorUserId}
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
