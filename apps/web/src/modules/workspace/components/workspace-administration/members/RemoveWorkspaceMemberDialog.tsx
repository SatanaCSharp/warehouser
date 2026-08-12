import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { WorkspaceRefusalAlert } from 'modules/workspace/components/workspace-administration/members/WorkspaceRefusalAlert';
import { useRemoveWorkspaceMember } from 'modules/workspace/hooks/useRemoveWorkspaceMember';
import { FormModalDialog } from 'shared/components/FormModalDialog';

import type { WorkspaceMember } from '@warehouser/contracts/workspaces';
import type { FormEvent, ReactElement } from 'react';

type RemoveWorkspaceMemberDialogProps = {
  member: WorkspaceMember;
  onClose: () => void;
};

/**
 * Ends a Workspace membership, stating both halves of the outcome: the person
 * keeps every Warehouse they belong to and only stops administering this
 * Workspace (AC-19a). A refusal is explained here, where the decision was made,
 * and nothing about the target is disclosed beyond what the row already showed.
 */
export const RemoveWorkspaceMemberDialog = ({
  member,
  onClose,
}: RemoveWorkspaceMemberDialogProps): ReactElement => {
  const { t } = useTranslation('workspace');
  const removeWorkspaceMember = useRemoveWorkspaceMember();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refusalCode, setRefusalCode] = useState<string>();

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setIsSubmitting(true);
    const outcome = await removeWorkspaceMember(member.userId);
    setIsSubmitting(false);

    if (outcome.success) {
      onClose();
      return;
    }
    setRefusalCode(outcome.code);
  };

  return (
    <FormModalDialog
      cancelLabel={t('members.remove.cancel')}
      isSubmitting={isSubmitting}
      noValidate
      submitLabel={t('members.remove.submit')}
      submitVariant="danger"
      title={t('members.remove.title', {
        name: member.email ?? member.userId,
      })}
      onClose={onClose}
      onSubmit={submit}
    >
      <p className="text-muted">{t('members.remove.description')}</p>
      <WorkspaceRefusalAlert code={refusalCode} />
    </FormModalDialog>
  );
};
