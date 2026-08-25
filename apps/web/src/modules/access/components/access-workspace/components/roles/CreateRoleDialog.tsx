import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { PermissionFieldset } from 'modules/access/components/access-workspace/components/roles/PermissionFieldset';
import { parseRoleFormValues } from 'modules/access/schemas/role-form';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

import type { RoleWrite } from '@warehouser/contracts/access';
import type { RoleFormValues } from 'modules/access/schemas/role-form';
import type { AccessPermission } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type CreateRoleDialogProps = {
  permissions: AccessPermission[];
  onSave: (input: RoleWrite) => Promise<MutationResult>;
};

/**
 * Creates a Role from a name and the Permissions it grants.
 *
 * The dialog stays open on a refusal so the name the server rejected can be
 * corrected in place; only a Role that now exists closes it — which is
 * `FormModalDialog`'s rule, not this component's.
 */
export const CreateRoleDialog = ({
  permissions,
  onSave,
}: CreateRoleDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const form = useForm<RoleFormValues>({
    defaultValues: { name: '', permissionIds: [] },
  });
  const {
    control,
    formState: { errors },
    register,
  } = form;

  const translateValidation = (code: string): string =>
    t(`administration.roleEditor.validation.${code}`);

  return (
    <FormModalDialog
      title={t('administration.roleEditor.createTitle')}
      cancelLabel={t('administration.cancel')}
      submitLabel={t('administration.roleEditor.save')}
      size="lg"
      scroll="inside"
      form={form}
      parse={parseRoleFormValues}
      translateValidation={translateValidation}
      onSubmit={onSave}
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
      <Controller
        control={control}
        name="permissionIds"
        render={({ field }) => (
          <PermissionFieldset
            isDisabled={false}
            permissions={permissions}
            selectedIds={field.value}
            onChange={field.onChange}
          />
        )}
      />
    </FormModalDialog>
  );
};
