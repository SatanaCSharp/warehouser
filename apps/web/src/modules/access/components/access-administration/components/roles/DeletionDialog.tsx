import { Select, SelectItem } from '@heroui/react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormModalDialog } from 'shared/components/FormModalDialog';

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
  const { control, handleSubmit } = useForm<DeletionForm>({
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
        <Controller
          control={control}
          name="replacement"
          rules={{ required: assigned }}
          render={({ field }) => (
            <Select
              isRequired
              validationBehavior="aria"
              label={t('administration.deletion.replacement')}
              placeholder={t('administration.select')}
              name={field.name}
              selectedKeys={field.value ? [field.value] : []}
              onSelectionChange={(keys) =>
                field.onChange(Array.from(keys)[0] ?? '')
              }
              onBlur={field.onBlur}
            >
              {roles
                .filter((candidate) => candidate.id !== role.id)
                .map((candidate) => (
                  <SelectItem key={candidate.id}>{candidate.name}</SelectItem>
                ))}
            </Select>
          )}
        />
      ) : (
        <p>{t('administration.deletion.unassigned')}</p>
      )}
    </FormModalDialog>
  );
};
