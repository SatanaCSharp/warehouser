import { useState } from 'react';

import { DeleteMemberDialog } from 'modules/access/components/access-workspace/components/members/DeleteMemberDialog';
import { EditEmailDialog } from 'modules/access/components/access-workspace/components/members/EditEmailDialog';
import { MemberList } from 'modules/access/components/access-workspace/components/members/MemberList';
import { ResetPasswordDialog } from 'modules/access/components/access-workspace/components/members/ResetPasswordDialog';
import { useAccessCapabilities } from 'modules/access/hooks/useAccessCapabilities';
import { useAccessRoles } from 'modules/access/hooks/useAccessRoles';
import { useChangeMemberEmail } from 'modules/access/hooks/useChangeMemberEmail';
import { useChangeMemberPassword } from 'modules/access/hooks/useChangeMemberPassword';
import { useDeleteMember } from 'modules/access/hooks/useDeleteMember';
import { selectCurrentUser } from 'modules/auth/store/auth.selectors';
import { useAppSelector } from 'store/hooks';

import type { AccessMember } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';

type MemberDirectoryProps = {
  isRefreshing: boolean;
  members: AccessMember[];
};

/** Which per-member dialog the list has opened, and for whom. */
type MemberDialog = {
  kind: 'deleteMember' | 'editEmail' | 'resetPassword';
  member: AccessMember;
};

/**
 * The member list and the dialogs its rows open. It resolves the acting user
 * itself because self-row gating (AC-11/AC-18) must never fall back to treating
 * every row as not-self while the auth store hasn't hydrated yet — the list
 * stays a loading skeleton instead of rendering live destructive controls
 * against an unresolved actor id.
 */
export const MemberDirectory = ({
  isRefreshing,
  members,
}: MemberDirectoryProps): ReactElement => {
  const { canDeleteMembers, canEditMemberEmails, canResetMemberPasswords } =
    useAccessCapabilities();
  const roles = useAccessRoles();
  const actor = useAppSelector(selectCurrentUser);
  const changeMemberEmail = useChangeMemberEmail();
  const changeMemberPassword = useChangeMemberPassword();
  const deleteMember = useDeleteMember();
  const [dialog, setDialog] = useState<MemberDialog | null>(null);
  const closeDialog = (): void => setDialog(null);

  return (
    <>
      <MemberList
        actorUserId={actor?.id ?? ''}
        canDeleteMember={canDeleteMembers}
        canEditEmail={canEditMemberEmails}
        canResetPassword={canResetMemberPasswords}
        isLoading={isRefreshing || actor === null}
        members={members}
        roles={roles.items}
        onDeleteMember={(member) => setDialog({ kind: 'deleteMember', member })}
        onEditEmail={(member) => setDialog({ kind: 'editEmail', member })}
        onResetPassword={(member) =>
          setDialog({ kind: 'resetPassword', member })
        }
      />

      {dialog?.kind === 'editEmail' ? (
        <EditEmailDialog
          member={dialog.member}
          onClose={closeDialog}
          onSave={(input) => changeMemberEmail(dialog.member.userId, input)}
        />
      ) : null}

      {dialog?.kind === 'resetPassword' ? (
        <ResetPasswordDialog
          member={dialog.member}
          onClose={closeDialog}
          onSave={(input) => changeMemberPassword(dialog.member.userId, input)}
        />
      ) : null}

      {dialog?.kind === 'deleteMember' ? (
        <DeleteMemberDialog
          member={dialog.member}
          onClose={closeDialog}
          onDelete={() => deleteMember(dialog.member.userId)}
        />
      ) : null}
    </>
  );
};
