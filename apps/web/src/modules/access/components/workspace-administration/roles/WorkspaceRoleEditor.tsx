import { Button } from '@heroui/react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { DeleteWorkspaceRoleAction } from 'modules/access/components/workspace-administration/roles/DeleteWorkspaceRoleAction';
import { WorkspacePermissionFieldset } from 'modules/access/components/workspace-administration/roles/WorkspacePermissionFieldset';
import { useSaveWorkspaceRole } from 'modules/access/hooks/mutations/useSaveWorkspaceRole';
import { workspaceRoleFormSchema } from 'modules/access/schemas/workspace-role-form.schema';
import { Conditional } from 'shared/components/Conditional';
import { FormTextField } from 'shared/components/FormTextField';
import { useFormFieldErrors } from 'shared/hooks/forms/useFormFieldErrors';

import type {
  WorkspacePermission,
  WorkspaceRole,
} from '@warehouser/contracts/workspaces';
import type { WorkspaceRoleFormValues } from 'modules/access/schemas/workspace-role-form.schema';
import type { ReactElement } from 'react';

type WorkspaceRoleEditorProps = {
  canUpdate: boolean;
  permissions: WorkspacePermission[];
  replacements: WorkspaceRole[];
  role: WorkspaceRole;
};

/**
 * Editor for the selected Workspace Role. It seeds itself from `role` once —
 * the directory keys it by Role id, so selecting another Role mounts a fresh
 * editor instead of resetting this one.
 *
 * The protected Workspace Owner Role shows every Permission granted and
 * locked, offers no rename, no delete and no save, and says that it is
 * system-managed rather than leaving the missing controls unexplained (AC-16).
 */
export const WorkspaceRoleEditor = ({
  canUpdate,
  permissions,
  replacements,
  role,
}: WorkspaceRoleEditorProps): ReactElement => {
  const { t } = useTranslation('access');
  const { t: translateValidation } = useTranslation('validation');
  const saveWorkspaceRole = useSaveWorkspaceRole();
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<WorkspaceRoleFormValues>({
    defaultValues: {
      name: role.name,
      workspacePermissionIds: role.workspacePermissionIds,
    },
  });
  const { setFieldError } =
    useFormFieldErrors<WorkspaceRoleFormValues>(setError);
  const isProtected = role.kind === 'workspace_owner';
  const isEditable = canUpdate && !isProtected;

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

    const result = await saveWorkspaceRole(parsed.data, role.id);
    if (!result.success) {
      setFieldError('name', result.fieldErrors?.name, translateValidation);
    }
  };

  const onDiscard = (): void => reset();

  return (
    <form
      aria-label={t('workspaceRoles.editor.regionLabel')}
      className="rounded-xl border border-border bg-surface p-5 sm:p-6"
      noValidate
      onSubmit={handleSubmit(submit)}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{role.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {isProtected
              ? t('workspaceRoles.protectedReason')
              : t('workspaceRoles.editor.subtitle', {
                  count: role.assignedMemberCount,
                })}
          </p>
        </div>
      </div>

      <Conditional when={isEditable}>
        <FormTextField
          className="mt-5"
          isRequired
          validationBehavior="aria"
          isInvalid={Boolean(errors.name)}
          errorMessage={errors.name?.message}
          defaultValue={role.name}
          isDisabled={isSubmitting}
          label={t('workspaceRoles.editor.nameLabel')}
          description={t('workspaceRoles.editor.nameDescription')}
          {...register('name')}
        />
      </Conditional>

      <div className="mt-6">
        <Controller
          control={control}
          name="workspacePermissionIds"
          render={({ field }) => (
            <WorkspacePermissionFieldset
              isDisabled={!isEditable}
              permissions={permissions}
              selectedIds={
                isProtected
                  ? permissions.map((permission) => permission.id)
                  : field.value
              }
              onChange={field.onChange}
            />
          )}
        />
      </div>

      {/* Soft-danger delete on the left, Cancel then the primary on the right
          (design-handoff.md §Component mapping, `AmkoM`). */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <DeleteWorkspaceRoleAction replacements={replacements} role={role} />
        </div>
        <Conditional when={isEditable}>
          <div className="flex gap-2">
            <Button
              isDisabled={isSubmitting}
              size="sm"
              variant="ghost"
              onPress={onDiscard}
            >
              {t('workspaceRoles.editor.cancel')}
            </Button>
            <Button
              className="font-semibold"
              isPending={isSubmitting}
              size="sm"
              type="submit"
              variant="primary"
            >
              {t('workspaceRoles.editor.save')}
            </Button>
          </div>
        </Conditional>
      </div>
    </form>
  );
};
