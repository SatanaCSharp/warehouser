import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormModalDialog } from 'modules/access/components/access-administration/FormModalDialog';

import type { AccessRole } from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

type DeletionDialogProps = {
  role: AccessRole;
  roles: AccessRole[];
  onClose: () => void;
  onDelete: (replacementRoleId: string | null) => Promise<void>;
};

type DeletionForm = { replacement: string };

export const DeletionDialog = ({
  role,
  roles,
  onClose,
  onDelete,
}: DeletionDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const assigned = role.assignedMemberCount > 0;
  const { handleSubmit, register } = useForm<DeletionForm>({
    defaultValues: { replacement: '' },
  });

  return (
    <FormModalDialog
      title={t('administration.deletion.title', { role: role.name })}
      cancelLabel={t('administration.cancel')}
      submitLabel={
        assigned
          ? t('administration.deletion.replaceAndDelete')
          : t('administration.deletion.confirm')
      }
      submitColor="danger"
      onClose={onClose}
      onSubmit={handleSubmit(({ replacement }) =>
        onDelete(assigned ? replacement : null),
      )}
    >
      {assigned ? (
        <label>
          {t('administration.deletion.replacement')}
          <select
            required
            {...register('replacement', { required: assigned })}
            className="mt-2 w-full rounded-medium border border-divider p-3"
          >
            <option value="">{t('administration.select')}</option>
            {roles
              .filter((candidate) => candidate.id !== role.id)
              .map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
          </select>
        </label>
      ) : (
        <p>{t('administration.deletion.unassigned')}</p>
      )}
    </FormModalDialog>
  );
};
