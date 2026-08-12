import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useAddWorkspaceMember } from 'modules/workspace/hooks/useAddWorkspaceMember';
import { useWorkspaceRoles } from 'modules/workspace/hooks/useWorkspaceRoles';
import { useWorkspaceUsers } from 'modules/workspace/hooks/useWorkspaceUsers';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormSelectField } from 'shared/components/FormSelectField';

import type { ReactElement } from 'react';

type AddWorkspaceMemberDialogProps = { onClose: () => void };

type AddWorkspaceMemberForm = { userId: string; workspaceRoleId: string };

/**
 * Makes one of this Workspace's Users a Workspace Member with a custom
 * Workspace Role (AC-19). The candidates come from the Workspace Users read the
 * tab already loaded, narrowed to the two conditions the addition requires:
 * they belong to a Warehouse of this Workspace (AC-20) and hold no Workspace
 * Role yet. The protected Workspace Owner Role is never a choice (AC-22).
 */
export const AddWorkspaceMemberDialog = ({
  onClose,
}: AddWorkspaceMemberDialogProps): ReactElement => {
  const { t } = useTranslation('workspace');
  const users = useWorkspaceUsers();
  const { customRoles } = useWorkspaceRoles();
  const addWorkspaceMember = useAddWorkspaceMember();
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
  } = useForm<AddWorkspaceMemberForm>({
    defaultValues: { userId: '', workspaceRoleId: '' },
  });

  const candidates = (users ?? []).filter(
    (user) => !user.isWorkspaceMember && user.warehouses.length > 0,
  );

  const submit = async (values: AddWorkspaceMemberForm): Promise<void> => {
    const outcome = await addWorkspaceMember(values);
    if (outcome.success) {
      onClose();
    }
  };

  return (
    <FormModalDialog
      cancelLabel={t('members.add.cancel')}
      isSubmitting={isSubmitting}
      noValidate
      submitLabel={t('members.add.submit')}
      title={t('members.add.title')}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
    >
      <p className="text-muted">{t('members.add.description')}</p>
      <Controller
        control={control}
        name="userId"
        rules={{ required: true }}
        render={({ field }) => (
          <FormSelectField
            isRequired
            validationBehavior="aria"
            label={t('members.add.personLabel')}
            name={field.name}
            options={candidates.map((user) => ({
              id: user.userId,
              label: user.email ?? user.userId,
            }))}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
      <Controller
        control={control}
        name="workspaceRoleId"
        rules={{ required: true }}
        render={({ field }) => (
          <FormSelectField
            isRequired
            validationBehavior="aria"
            label={t('members.add.roleLabel')}
            name={field.name}
            options={customRoles.map((role) => ({
              id: role.id,
              label: role.name,
            }))}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
    </FormModalDialog>
  );
};
