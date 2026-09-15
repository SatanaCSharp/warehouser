import type { WorkspaceMember } from '@warehouser/contracts/workspaces';
import { useAssignWorkspaceRoleMutation } from 'modules/access/api/workspace-members-api';
import { WorkspaceRefusalAlert } from 'modules/access/components/workspace-administration/members/WorkspaceRefusalAlert';
import { useWorkspaceRoles } from 'modules/access/hooks/queries/useWorkspaceRoles';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormSelectField } from 'shared/components/FormSelectField';

type ChangeWorkspaceRoleDialogProps = {
  member: WorkspaceMember;
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
}: ChangeWorkspaceRoleDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const { customRoles } = useWorkspaceRoles();
  const [assignWorkspaceRole] = useAssignWorkspaceRoleMutation();
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<ChangeWorkspaceRoleForm>({
    defaultValues: { workspaceRoleId: '' },
  });

  const onSubmit = ({
    workspaceRoleId,
  }: ChangeWorkspaceRoleForm): Promise<MutationResult> =>
    assignWorkspaceRole({ userId: member.userId, workspaceRoleId });

  return (
    <FormModalDialog
      cancelLabel={t('workspaceMembers.changeRole.cancel')}
      submitLabel={t('workspaceMembers.changeRole.submit')}
      title={t('workspaceMembers.changeRole.title', {
        name: member.email ?? member.userId,
      })}
      form={form}
      onRefusal={setRefusalCode}
      onSubmit={onSubmit}
    >
      <Controller
        control={form.control}
        name="workspaceRoleId"
        rules={{ required: true }}
        render={({ field }) => (
          <FormSelectField
            isRequired
            validationBehavior="aria"
            description={t('workspaceMembers.changeRole.roleDescription')}
            label={t('workspaceMembers.changeRole.roleLabel')}
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
