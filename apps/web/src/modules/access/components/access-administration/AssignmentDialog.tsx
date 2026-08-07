import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormModalDialog } from 'modules/access/components/access-administration/FormModalDialog';

import type { AccessRole } from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

type AssignmentDialogProps = {
  memberId: string;
  roles: AccessRole[];
  onClose: () => void;
  onSave: (roleId: string) => Promise<void>;
};

type AssignmentForm = { roleId: string };

export const AssignmentDialog = ({
  memberId,
  roles,
  onClose,
  onSave,
}: AssignmentDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const { handleSubmit, register } = useForm<AssignmentForm>({
    defaultValues: { roleId: '' },
  });

  return (
    <FormModalDialog
      title={t('administration.assignment.title')}
      cancelLabel={t('administration.cancel')}
      submitLabel={t('administration.assignment.save')}
      onClose={onClose}
      onSubmit={handleSubmit(({ roleId }) => onSave(roleId))}
    >
      <label>
        {t('administration.assignment.role')}
        <select
          required
          {...register('roleId', { required: true })}
          className="mt-2 w-full rounded-medium border border-divider p-3"
        >
          <option value="">{t('administration.select')}</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </label>
      <p className="font-mono text-sm">{memberId}</p>
    </FormModalDialog>
  );
};
