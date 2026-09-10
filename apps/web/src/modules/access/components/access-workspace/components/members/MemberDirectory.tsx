import type {
  EmailChangeInput,
  PasswordChangeInput,
} from '@warehouser/contracts/users';
import {
  useChangeMemberEmailMutation,
  useChangeMemberPasswordMutation,
  useDeleteMemberMutation,
} from 'modules/access/api/access-api';
import { DeleteMemberDialog } from 'modules/access/components/access-workspace/components/members/DeleteMemberDialog';
import { EditEmailDialog } from 'modules/access/components/access-workspace/components/members/EditEmailDialog';
import { MemberList } from 'modules/access/components/access-workspace/components/members/MemberList';
import { ResetPasswordDialog } from 'modules/access/components/access-workspace/components/members/ResetPasswordDialog';
import { useAccessScope } from 'modules/access/hooks/projections/useAccessScope';
import { useAccessRoles } from 'modules/access/hooks/queries/useAccessRoles';
import type { AccessMember } from 'modules/access/types/access.types';
import { selectCurrentUser } from 'modules/auth/store/auth.selectors';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { ActionDialogHost } from 'shared/components/ActionDialogHost';
import { useActionDialog } from 'shared/hooks/state/useActionDialog';
import { useAppSelector } from 'store/hooks';

type MemberDirectoryProps = {
  members: AccessMember[];
};

/** Which per-member dialog a row opens. */
type MemberDialogKind = 'deleteMember' | 'editEmail' | 'resetPassword';

/**
 * The member list and the dialogs its rows open. It resolves the acting user
 * itself and hands the answer down **unresolved when it is unresolved**: an
 * actor the auth store has not settled arrives as `undefined`, never as a
 * defaulted id, so self-row gating (AC-11/AC-18) cannot silently evaluate every
 * row as somebody else's. `MemberRow` withholds every destructive control for
 * as long as that lasts (CR-RG-01). The rows themselves stay painted — a
 * background refetch never replaces what the actor is reading (CR-AC-10).
 *
 * The three dialogs are opened per member through `useActionDialog` and mounted
 * by `ActionDialogHost` (`docs/system/guides/web-action-dialogs.md`).
 */
export const MemberDirectory = ({
  members,
}: MemberDirectoryProps): ReactElement => {
  const { warehouseId } = useAccessScope();
  const roles = useAccessRoles();
  const actor = useAppSelector(selectCurrentUser);
  const [changeMemberEmail] = useChangeMemberEmailMutation();
  const [changeMemberPassword] = useChangeMemberPasswordMutation();
  const [deleteMember] = useDeleteMemberMutation();
  const dialog = useActionDialog<MemberDialogKind, AccessMember>();

  const onOpenDialog =
    (kind: MemberDialogKind) =>
    (member: AccessMember): void =>
      dialog.open(kind, member);

  const onSaveEmail =
    (member: AccessMember) =>
    (input: EmailChangeInput): Promise<MutationResult> =>
      changeMemberEmail({
        warehouseId: warehouseId ?? '',
        userId: member.userId,
        input,
      });

  const onSavePassword =
    (member: AccessMember) =>
    (input: PasswordChangeInput): Promise<MutationResult> =>
      changeMemberPassword({
        warehouseId: warehouseId ?? '',
        userId: member.userId,
        input,
      });

  const onConfirmDelete =
    (member: AccessMember) => (): Promise<MutationResult> =>
      deleteMember({ warehouseId: warehouseId ?? '', userId: member.userId });

  return (
    <>
      <MemberList
        actorUserId={actor?.id}
        members={members}
        roles={roles.items}
        onDeleteMember={onOpenDialog('deleteMember')}
        onEditEmail={onOpenDialog('editEmail')}
        onResetPassword={onOpenDialog('resetPassword')}
      />

      <ActionDialogHost
        controller={dialog}
        renderDialogs={{
          editEmail: (member) => (
            <EditEmailDialog member={member} onSave={onSaveEmail(member)} />
          ),
          resetPassword: (member) => (
            <ResetPasswordDialog
              member={member}
              onSave={onSavePassword(member)}
            />
          ),
          deleteMember: (member) => (
            <DeleteMemberDialog
              member={member}
              onDelete={onConfirmDelete(member)}
            />
          ),
        }}
      />
    </>
  );
};
