import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { WorkspacePermissionFieldset } from 'modules/access/components/workspace-administration/roles/WorkspacePermissionFieldset';
import { useSaveWorkspaceRole } from 'modules/access/hooks/useSaveWorkspaceRole';
import { workspaceRoleFormSchema } from 'modules/access/schemas/workspace-role-form.schema';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';
import { useFormFieldErrors } from 'shared/hooks/useFormFieldErrors';

import type { WorkspacePermission } from '@warehouser/contracts/workspaces';
import type { WorkspaceRoleFormValues } from 'modules/access/schemas/workspace-role-form.schema';
import type { ReactElement } from 'react';

type CreateWorkspaceRoleDialogProps = {
  permissions: WorkspacePermission[];
  onClose: () => void;
};

/**
 * Creates a custom Workspace Role from a name and the assignable Permissions
 * it grants — including none at all (AC-14). The dialog stays open on failure
 * so the member can correct the name the server rejected (AC-15).
 */
export const CreateWorkspaceRoleDialog = ({
  permissions,
  onClose,
}: CreateWorkspaceRoleDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const { t: translateValidation } = useTranslation('validation');
  const saveWorkspaceRole = useSaveWorkspaceRole();
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<WorkspaceRoleFormValues>({
    defaultValues: { name: '', workspacePermissionIds: [] },
  });
  const { setFieldError } =
    useFormFieldErrors<WorkspaceRoleFormValues>(setError);

  const submit = async (values: WorkspaceRoleFormValues): Promise<void> => {
    const parsed = workspaceRoleFormSchema.safeParse(values);
    if (!parsed.success) {
      setFieldError(
        'name',
        parsed.error.issues[0]?.message,
        translateValidation,
      );
      return;
    }

    const result = await saveWorkspaceRole(parsed.data);
    if (result.success) {
      onClose();
      return;
    }
    setFieldError('name', result.fieldErrors?.name, translateValidation);
  };

  return (
    <FormModalDialog
      cancelLabel={t('workspaceRoles.create.cancel')}
      isSubmitting={isSubmitting}
      noValidate
      scroll="inside"
      size="lg"
      submitLabel={t('workspaceRoles.create.submit')}
      title={t('workspaceRoles.create.title')}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
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
