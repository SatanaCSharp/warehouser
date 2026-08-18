import union from 'lodash/union';
import without from 'lodash/without';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { PermissionCheckbox } from 'modules/access/components/access-workspace/components/roles/PermissionCheckbox';
import { useRoleForm } from 'modules/access/hooks/forms/useRoleForm';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

import type { RoleWrite } from '@warehouser/contracts/access';
import type { AccessPermission } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';
import type { MutationOutcome } from 'shared/api/client/mutation-outcome';

type CreateRoleDialogProps = {
  permissions: AccessPermission[];
  onClose: () => void;
  onSave: (input: RoleWrite) => Promise<MutationOutcome>;
};

/** Creates a Role from a name and the Permissions it grants. */
export const CreateRoleDialog = ({
  permissions,
  onClose,
  onSave,
}: CreateRoleDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const { control, errors, register, submit } = useRoleForm({
    defaultValues: { name: '', permissionIds: [] },
    onSave,
  });

  return (
    <FormModalDialog
      title={t('administration.roleEditor.createTitle')}
      cancelLabel={t('administration.cancel')}
      submitLabel={t('administration.roleEditor.save')}
      size="lg"
      scroll="inside"
      onClose={onClose}
      onSubmit={submit}
    >
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.name)}
        errorMessage={errors.name?.message}
        label={t('administration.roleEditor.name')}
        {...register('name')}
      />
      <fieldset className="space-y-3">
        <legend className="font-medium">
          {t('administration.roleEditor.permissions')}
        </legend>
        <Controller
          control={control}
          name="permissionIds"
          render={({ field }) => {
            const onTogglePermission =
              (permissionId: string) =>
              (isSelected: boolean): void =>
                field.onChange(
                  isSelected
                    ? union(field.value, [permissionId])
                    : without(field.value, permissionId),
                );

            return (
              <>
                {permissions.map((permission) => (
                  <PermissionCheckbox
                    key={permission.id}
                    isDisabled={permission.kind === 'reserved'}
                    isSelected={field.value.includes(permission.id)}
                    permission={permission}
                    onChange={onTogglePermission(permission.id)}
                  />
                ))}
              </>
            );
          }}
        />
      </fieldset>
    </FormModalDialog>
  );
};
