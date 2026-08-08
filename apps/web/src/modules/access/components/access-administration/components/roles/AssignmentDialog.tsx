import { Select, SelectItem } from '@heroui/react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormModalDialog } from 'shared/components/FormModalDialog';

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
  const { control, handleSubmit } = useForm<AssignmentForm>({
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
      <Controller
        control={control}
        name="roleId"
        rules={{ required: true }}
        render={({ field }) => (
          <Select
            isRequired
            validationBehavior="aria"
            label={t('administration.assignment.role')}
            placeholder={t('administration.select')}
            name={field.name}
            selectedKeys={field.value ? [field.value] : []}
            onSelectionChange={(keys) =>
              field.onChange(Array.from(keys)[0] ?? '')
            }
            onBlur={field.onBlur}
          >
            {roles.map((role) => (
              <SelectItem key={role.id}>{role.name}</SelectItem>
            ))}
          </Select>
        )}
      />
      <p className="font-mono text-sm">{memberId}</p>
    </FormModalDialog>
  );
};
