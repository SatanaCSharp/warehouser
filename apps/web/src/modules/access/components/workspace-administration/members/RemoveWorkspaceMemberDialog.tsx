import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRemoveWorkspaceMemberMutation } from 'modules/access/api/workspace-members-api';
import { WorkspaceRefusalAlert } from 'modules/access/components/workspace-administration/members/WorkspaceRefusalAlert';
import { ConfirmAlertDialog } from 'shared/components/ConfirmAlertDialog';

import type { WorkspaceMember } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type RemoveWorkspaceMemberDialogProps = {
  member: WorkspaceMember;
};

/**
 * Ends a Workspace membership, stating both halves of the outcome: the person
 * keeps every Warehouse they belong to and only stops administering this
 * Workspace (AC-19a). A refusal is explained here, where the decision was made,
 * and nothing about the target is disclosed beyond what the row already showed.
 *
 * Nothing here is filled in or validated, so it is a `ConfirmAlertDialog`
 * (`docs/system/guides/web-dialogs.md`).
 */
export const RemoveWorkspaceMemberDialog = ({
  member,
}: RemoveWorkspaceMemberDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const [removeWorkspaceMember] = useRemoveWorkspaceMemberMutation();
  const [refusalCode, setRefusalCode] = useState<string>();

  const onConfirm = (): Promise<MutationResult> =>
    removeWorkspaceMember(member.userId);

  return (
    <ConfirmAlertDialog
      title={t('workspaceMembers.remove.title', {
        name: member.email ?? member.userId,
      })}
      cancelLabel={t('workspaceMembers.remove.cancel')}
      confirmLabel={t('workspaceMembers.remove.submit')}
      onConfirm={onConfirm}
      onRefusal={setRefusalCode}
    >
      <p className="text-muted">{t('workspaceMembers.remove.description')}</p>
      <WorkspaceRefusalAlert code={refusalCode} />
    </ConfirmAlertDialog>
  );
};
