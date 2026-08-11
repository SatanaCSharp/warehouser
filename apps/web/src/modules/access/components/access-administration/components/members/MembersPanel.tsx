import { PermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';

import { MemberList } from 'modules/access/components/access-administration/components/members/MemberList';
import { selectCurrentUser } from 'modules/auth/store/auth.selectors';
import { hasPermission } from 'shared/hooks/usePermissions';
import { useAppSelector } from 'store/hooks';

import type {
  AccessMember,
  AccessRole,
  OpenAccessWorkflow,
} from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

type MembersPanelProps = {
  isLoading: boolean;
  members: AccessMember[];
  permissionIds: readonly string[];
  roles: AccessRole[];
  onOpenWorkflow: OpenAccessWorkflow;
};

/**
 * Members half of the administration surface. It resolves the acting user
 * itself because self-row gating (AC-11/AC-18) must never fall back to treating
 * every row as not-self while the auth store hasn't hydrated yet — the list
 * stays a loading skeleton instead of rendering live destructive controls
 * against an unresolved actor id.
 */
export const MembersPanel = ({
  isLoading,
  members,
  permissionIds,
  roles,
  onOpenWorkflow,
}: MembersPanelProps): ReactElement => {
  const currentUser = useAppSelector(selectCurrentUser);
  const [query, setQuery] = useState('');

  return (
    <MemberList
      actorUserId={currentUser?.id ?? ''}
      canDeleteMember={hasPermission(permissionIds, PermissionId.USERS_DELETE)}
      canEditEmail={hasPermission(
        permissionIds,
        PermissionId.USERS_EMAIL_UPDATE,
      )}
      canResetPassword={hasPermission(
        permissionIds,
        PermissionId.USERS_PASSWORD_CHANGE,
      )}
      isLoading={isLoading || currentUser === null}
      members={members}
      query={query}
      roles={roles}
      onDeleteMember={(member) =>
        onOpenWorkflow({ kind: 'deleteMember', member })
      }
      onEditEmail={(member) => onOpenWorkflow({ kind: 'editEmail', member })}
      onQueryChange={setQuery}
      onResetPassword={(member) =>
        onOpenWorkflow({ kind: 'resetPassword', member })
      }
    />
  );
};
