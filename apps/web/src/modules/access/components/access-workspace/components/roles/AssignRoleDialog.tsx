import type { AccessRole } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormSelectField } from 'shared/components/FormSelectField';

type AssignRoleDialogProps = {
  /** Named by address, not by id — the member projection carries both. */
  memberEmail: string;
  roles: AccessRole[];
  onSave: (roleId: string) => Promise<MutationResult>;
};

type AssignRoleForm = { roleId: string };

export const AssignRoleDialog = ({
  memberEmail,
  roles,
  onSave,
}: AssignRoleDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const form = useForm<AssignRoleForm>({ defaultValues: { roleId: '' } });

  const onSubmit = ({ roleId }: AssignRoleForm): Promise<MutationResult> =>
    onSave(roleId);

  return (
    <FormModalDialog
      title={t('administration.assignment.title')}
      cancelLabel={t('administration.cancel')}
      submitLabel={t('administration.assignment.save')}
      form={form}
      onSubmit={onSubmit}
    >
      <Controller
        control={form.control}
        name="roleId"
        rules={{ required: true }}
        render={({ field }) => (
          <FormSelectField
            isRequired
            validationBehavior="aria"
            label={t('administration.assignment.role')}
            placeholder={t('administration.select')}
            name={field.name}
            options={roles.map((role) => ({ id: role.id, label: role.name }))}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
      <p className="text-sm">{memberEmail}</p>
    </FormModalDialog>
  );
};
