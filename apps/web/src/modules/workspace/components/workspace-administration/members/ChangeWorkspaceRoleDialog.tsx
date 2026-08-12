import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { WorkspaceRefusalAlert } from 'modules/workspace/components/workspace-administration/members/WorkspaceRefusalAlert';
import { useAssignWorkspaceRole } from 'modules/workspace/hooks/useAssignWorkspaceRole';
import { useWorkspaceRoles } from 'modules/workspace/hooks/useWorkspaceRoles';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormSelectField } from 'shared/components/FormSelectField';

import type { WorkspaceMember } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type ChangeWorkspaceRoleDialogProps = {
  member: WorkspaceMember;
  onClose: () => void;
};

type ChangeWorkspaceRoleForm = { workspaceRoleId: string };

/**
 * Moves a Workspace Member to a different custom Workspace Role, and says what
 * that means: a member holds exactly one (AC-19b). The protected Workspace
 * Owner Role is never a target, and the Role the member already holds is not
 * offered either — this dialog only moves them somewhere else (AC-22).
 */
export const ChangeWorkspaceRoleDialog = ({
  member,
  onClose,
}: ChangeWorkspaceRoleDialogProps): ReactElement => {
  const { t } = useTranslation('workspace');
  const { customRoles } = useWorkspaceRoles();
  const assignWorkspaceRole = useAssignWorkspaceRole();
  const [refusalCode, setRefusalCode] = useState<string>();
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
  } = useForm<ChangeWorkspaceRoleForm>({
    defaultValues: { workspaceRoleId: '' },
  });

  const submit = async ({
    workspaceRoleId,
  }: ChangeWorkspaceRoleForm): Promise<void> => {
    const outcome = await assignWorkspaceRole(member.userId, workspaceRoleId);
    if (outcome.success) {
      onClose();
      return;
    }
    setRefusalCode(outcome.code);
  };

  return (
    <FormModalDialog
      cancelLabel={t('members.changeRole.cancel')}
      isSubmitting={isSubmitting}
      noValidate
      submitLabel={t('members.changeRole.submit')}
      title={t('members.changeRole.title', {
        name: member.email ?? member.userId,
      })}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
    >
      <Controller
        control={control}
        name="workspaceRoleId"
        rules={{ required: true }}
        render={({ field }) => (
          <FormSelectField
            isRequired
            validationBehavior="aria"
            description={t('members.changeRole.roleDescription')}
            label={t('members.changeRole.roleLabel')}
            name={field.name}
            options={customRoles
              .filter((role) => role.id !== member.workspaceRoleId)
              .map((role) => ({ id: role.id, label: role.name }))}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
      <WorkspaceRefusalAlert code={refusalCode} />
    </FormModalDialog>
  );
};
