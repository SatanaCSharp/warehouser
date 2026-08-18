import { useState } from 'react';

import { DeleteMemberDialog } from 'modules/access/components/access-workspace/components/members/DeleteMemberDialog';
import { EditEmailDialog } from 'modules/access/components/access-workspace/components/members/EditEmailDialog';
import { MemberList } from 'modules/access/components/access-workspace/components/members/MemberList';
import { ResetPasswordDialog } from 'modules/access/components/access-workspace/components/members/ResetPasswordDialog';
import { useChangeMemberEmail } from 'modules/access/hooks/mutations/useChangeMemberEmail';
import { useChangeMemberPassword } from 'modules/access/hooks/mutations/useChangeMemberPassword';
import { useDeleteMember } from 'modules/access/hooks/mutations/useDeleteMember';
import { useAccessCapabilities } from 'modules/access/hooks/projections/useAccessCapabilities';
import { useAccessRoles } from 'modules/access/hooks/queries/useAccessRoles';
import { selectCurrentUser } from 'modules/auth/store/auth.selectors';
import { useAppSelector } from 'store/hooks';

import type {
  EmailChangeInput,
  PasswordChangeInput,
} from '@warehouser/contracts/users';
import type { AccessMember } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';
import type { MutationOutcome } from 'shared/api/client/mutation-outcome';

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
  const {
    canDeleteMembers,
    canEditMemberEmails,
    canResetMemberPasswords,
    warehouseId,
  } = useAccessCapabilities();
  const roles = useAccessRoles();
  const actor = useAppSelector(selectCurrentUser);
  const changeMemberEmail = useChangeMemberEmail(warehouseId ?? '');
  const changeMemberPassword = useChangeMemberPassword(warehouseId ?? '');
  const deleteMember = useDeleteMember(warehouseId ?? '');
  const [dialog, setDialog] = useState<MemberDialog | null>(null);

  const onCloseDialog = (): void => setDialog(null);

  const onOpenDialog =
    (kind: MemberDialog['kind']) =>
    (member: AccessMember): void =>
      setDialog({ kind, member });

  const onSaveEmail =
    (member: AccessMember) =>
    (input: EmailChangeInput): Promise<MutationOutcome> =>
      changeMemberEmail(member.userId, input);

  const onSavePassword =
    (member: AccessMember) =>
    (input: PasswordChangeInput): Promise<MutationOutcome> =>
      changeMemberPassword(member.userId, input);

  const onConfirmDelete =
    (member: AccessMember) => (): Promise<MutationOutcome> =>
      deleteMember(member.userId);

  // Every dialog reads the member its row was opened for, so the open one is
  // resolved by a lookup here rather than gated inline: `Conditional` evaluates
  // both arms, and no member exists until a row opens one.
  const openDialog =
    dialog === null
      ? null
      : {
          editEmail: (
            <EditEmailDialog
              member={dialog.member}
              onClose={onCloseDialog}
              onSave={onSaveEmail(dialog.member)}
            />
          ),
          resetPassword: (
            <ResetPasswordDialog
              member={dialog.member}
              onClose={onCloseDialog}
              onSave={onSavePassword(dialog.member)}
            />
          ),
          deleteMember: (
            <DeleteMemberDialog
              member={dialog.member}
              onClose={onCloseDialog}
              onDelete={onConfirmDelete(dialog.member)}
            />
          ),
        }[dialog.kind];

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
        onDeleteMember={onOpenDialog('deleteMember')}
        onEditEmail={onOpenDialog('editEmail')}
        onResetPassword={onOpenDialog('resetPassword')}
      />

      {openDialog}
    </>
  );
};
