import type { AccessRole } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { Conditional } from 'shared/components/Conditional';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormSelectField } from 'shared/components/FormSelectField';

type DeleteRoleDialogProps = {
  role: AccessRole;
  roles: AccessRole[];
  onDelete: (replacementRoleId: string | null) => Promise<MutationResult>;
};

type DeleteRoleForm = { replacement: string };

/**
 * Deletes a Role. An assigned one asks which Role its members move to, so the
 * choice is validated and this is a `FormModalDialog` rather than a plain
 * confirmation (`docs/system/guides/web-dialogs.md`).
 */
export const DeleteRoleDialog = ({
  role,
  roles,
  onDelete,
}: DeleteRoleDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const assigned = role.assignedMemberCount > 0;
  const form = useForm<DeleteRoleForm>({ defaultValues: { replacement: '' } });

  const onSubmit = ({ replacement }: DeleteRoleForm): Promise<MutationResult> =>
    onDelete(assigned ? replacement : null);

  return (
    <FormModalDialog
      title={t('administration.deletion.title', { role: role.name })}
      cancelLabel={t('administration.cancel')}
      submitLabel={
        assigned
          ? t('administration.deletion.replaceAndDelete')
          : t('administration.deletion.confirm')
      }
      submitVariant="danger"
      form={form}
      onSubmit={onSubmit}
    >
      <Conditional
        when={assigned}
        otherwise={<p>{t('administration.deletion.unassigned')}</p>}
      >
        <Controller
          control={form.control}
          name="replacement"
          rules={{ required: assigned }}
          render={({ field }) => (
            <FormSelectField
              isRequired
              validationBehavior="aria"
              label={t('administration.deletion.replacement')}
              placeholder={t('administration.select')}
              name={field.name}
              options={roles
                .filter((candidate) => candidate.id !== role.id)
                .map((candidate) => ({
                  id: candidate.id,
                  label: candidate.name,
                }))}
              value={field.value}
              onBlur={field.onBlur}
              onChange={field.onChange}
            />
          )}
        />
      </Conditional>
    </FormModalDialog>
  );
};
