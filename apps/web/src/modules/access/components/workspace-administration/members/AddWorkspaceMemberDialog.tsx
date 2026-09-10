import { useAddWorkspaceMemberMutation } from 'modules/access/api/workspace-members-api';
import { useWorkspaceRoles } from 'modules/access/hooks/queries/useWorkspaceRoles';
import { useWorkspaceUsers } from 'modules/access/hooks/queries/useWorkspaceUsers';
import type { ReactElement } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormSelectField } from 'shared/components/FormSelectField';

type AddWorkspaceMemberForm = { userId: string; workspaceRoleId: string };

/**
 * Makes one of this Workspace's Users a Workspace Member with a custom
 * Workspace Role (AC-19). The candidates come from the Workspace Users read the
 * tab already loaded, narrowed to the two conditions the addition requires:
 * they belong to a Warehouse of this Workspace (AC-20) and hold no Workspace
 * Role yet. The protected Workspace Owner Role is never a choice (AC-22).
 */
export const AddWorkspaceMemberDialog = (): ReactElement => {
  const { t } = useTranslation('access');
  const users = useWorkspaceUsers();
  const { customRoles } = useWorkspaceRoles();
  const [addWorkspaceMember] = useAddWorkspaceMemberMutation();
  const form = useForm<AddWorkspaceMemberForm>({
    defaultValues: { userId: '', workspaceRoleId: '' },
  });

  const candidates = (users ?? []).filter(
    (user) => !user.isWorkspaceMember && user.warehouses.length > 0,
  );

  return (
    <FormModalDialog
      cancelLabel={t('workspaceMembers.add.cancel')}
      submitLabel={t('workspaceMembers.add.submit')}
      title={t('workspaceMembers.add.title')}
      form={form}
      onSubmit={addWorkspaceMember}
    >
      <p className="text-muted">{t('workspaceMembers.add.description')}</p>
      <Controller
        control={form.control}
        name="userId"
        rules={{ required: true }}
        render={({ field }) => (
          <FormSelectField
            isRequired
            validationBehavior="aria"
            label={t('workspaceMembers.add.personLabel')}
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
        control={form.control}
        name="workspaceRoleId"
        rules={{ required: true }}
        render={({ field }) => (
          <FormSelectField
            isRequired
            validationBehavior="aria"
            label={t('workspaceMembers.add.roleLabel')}
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
