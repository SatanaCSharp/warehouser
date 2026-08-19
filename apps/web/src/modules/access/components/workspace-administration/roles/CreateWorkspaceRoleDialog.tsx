import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useCreateWorkspaceRoleMutation } from 'modules/access/api/workspace-roles-api';
import { WorkspacePermissionFieldset } from 'modules/access/components/workspace-administration/roles/WorkspacePermissionFieldset';
import { workspaceRoleFormSchema } from 'modules/access/schemas/workspace-role-form.schema';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';
import { parseWithSchema } from 'shared/utils/form-parse';

import type { WorkspacePermission } from '@warehouser/contracts/workspaces';
import type { WorkspaceRoleFormValues } from 'modules/access/schemas/workspace-role-form.schema';
import type { ReactElement } from 'react';

type CreateWorkspaceRoleDialogProps = {
  permissions: WorkspacePermission[];
};

/** AC-15a — the browser pre-check the dialog runs before the request leaves. */
const parse = parseWithSchema(workspaceRoleFormSchema);

/**
 * Creates a custom Workspace Role from a name and the assignable Permissions
 * it grants — including none at all (AC-14). The dialog stays open on failure
 * so the member can correct the name the server rejected (AC-15).
 */
export const CreateWorkspaceRoleDialog = ({
  permissions,
}: CreateWorkspaceRoleDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const { t: translateValidation } = useTranslation('validation');
  const [createWorkspaceRole] = useCreateWorkspaceRoleMutation();
  const form = useForm<WorkspaceRoleFormValues>({
    defaultValues: { name: '', workspacePermissionIds: [] },
  });
  const {
    control,
    formState: { errors, isSubmitting },
    register,
  } = form;

  return (
    <FormModalDialog
      cancelLabel={t('workspaceRoles.create.cancel')}
      scroll="inside"
      size="lg"
      submitLabel={t('workspaceRoles.create.submit')}
      title={t('workspaceRoles.create.title')}
      form={form}
      parse={parse}
      translateValidation={translateValidation}
      onSubmit={createWorkspaceRole}
    >
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.name)}
        errorMessage={errors.name?.message}
        isDisabled={isSubmitting}
        label={t('workspaceRoles.editor.nameLabel')}
        description={t('workspaceRoles.editor.nameDescription')}
        {...register('name')}
      />
      <Controller
        control={control}
        name="workspacePermissionIds"
        render={({ field }) => (
          <WorkspacePermissionFieldset
            isDisabled={isSubmitting}
            permissions={permissions}
            selectedIds={field.value}
            onChange={field.onChange}
          />
        )}
      />
    </FormModalDialog>
  );
};
