import { CreateMemberDialog } from 'modules/access/components/access-administration/components/members/CreateMemberDialog';
import { DeleteMemberDialog } from 'modules/access/components/access-administration/components/members/DeleteMemberDialog';
import { EditEmailDialog } from 'modules/access/components/access-administration/components/members/EditEmailDialog';
import { ResetPasswordDialog } from 'modules/access/components/access-administration/components/members/ResetPasswordDialog';

import type {
  AccessAdministrationActions,
  AccessRole,
  AccessWorkflow,
} from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

type MemberWorkflowDialogsProps = Pick<
  AccessAdministrationActions,
  | 'onChangeMemberEmail'
  | 'onChangeMemberPassword'
  | 'onCreateMember'
  | 'onDeleteMember'
> & {
  customRoles: AccessRole[];
  workflow: AccessWorkflow | null;
  onClose: () => void;
};

/**
 * Renders the dialog for the open member workflow, and nothing at all for the
 * role workflows — those belong to `RoleWorkflowDialogs`. Each dialog reports
 * field-level failures inline, and its mutation's success toast reports the
 * outcome.
 */
export const MemberWorkflowDialogs = ({
  customRoles,
  workflow,
  onChangeMemberEmail,
  onChangeMemberPassword,
  onClose,
  onCreateMember,
  onDeleteMember,
}: MemberWorkflowDialogsProps): ReactElement | null => {
  if (!workflow) {
    return null;
  }

  switch (workflow.kind) {
    case 'create':
      return (
        <CreateMemberDialog
          roles={customRoles}
          onClose={onClose}
          onSave={onCreateMember}
        />
      );
    case 'editEmail':
      return (
        <EditEmailDialog
          member={workflow.member}
          onClose={onClose}
          onSave={(input) => onChangeMemberEmail(workflow.member.userId, input)}
        />
      );
    case 'resetPassword':
      return (
        <ResetPasswordDialog
          member={workflow.member}
          onClose={onClose}
          onSave={(input) =>
            onChangeMemberPassword(workflow.member.userId, input)
          }
        />
      );
    case 'deleteMember':
      return (
        <DeleteMemberDialog
          member={workflow.member}
          onClose={onClose}
          onDelete={() => onDeleteMember(workflow.member.userId)}
        />
      );
    default:
      return null;
  }
};
