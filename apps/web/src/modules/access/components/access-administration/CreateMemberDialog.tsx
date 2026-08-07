import { Input, Select, SelectItem } from '@heroui/react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { parseCreateMemberForm } from 'modules/access/schemas/create-member-form';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { PasswordInput } from 'shared/components/PasswordInput';

import type { CreateMemberInput } from '@warehouser/contracts/users';
import type {
  AccessRole,
  MutationOutcome,
} from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

type CreateMemberDialogProps = {
  roles: AccessRole[];
  onClose: () => void;
  onSave: (input: CreateMemberInput) => Promise<MutationOutcome>;
};

type CreateMemberForm = { email: string; password: string; roleId: string };

export const CreateMemberDialog = ({
  roles,
  onClose,
  onSave,
}: CreateMemberDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<CreateMemberForm>({
    defaultValues: { email: '', password: '', roleId: '' },
  });

  const selectableRoles = roles.filter(
    (role) => role.kind !== 'warehouse_manager',
  );

  const submit = async ({
    email,
    password,
    roleId,
  }: CreateMemberForm): Promise<void> => {
    const parsed = parseCreateMemberForm(email, password, roleId);
    if (!parsed.success) {
      if (parsed.error.email) {
        setError('email', {
          message: t(
            `administration.createMember.validation.email.${parsed.error.email}`,
          ),
        });
      }
      if (parsed.error.password) {
        setError('password', {
          message: t(
            `administration.createMember.validation.password.${parsed.error.password}`,
          ),
        });
      }
      return;
    }

    const result = await onSave(parsed.data);
    if (result.success) {
      onClose();
      return;
    }
    if (result.fieldErrors?.email) {
      setError('email', {
        message: t(
          `administration.createMember.validation.email.${result.fieldErrors.email}`,
        ),
      });
    }
    if (result.fieldErrors?.roleId) {
      setError('roleId', {
        message: t(
          `administration.createMember.validation.role.${result.fieldErrors.roleId}`,
        ),
      });
    }
  };

  return (
    <FormModalDialog
      title={t('administration.createMember.title')}
      cancelLabel={t('administration.cancel')}
      submitLabel={t('administration.createMember.save')}
      size="lg"
      scrollBehavior="inside"
      noValidate
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
    >
      <Input
        autoFocus
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.email)}
        errorMessage={errors.email?.message}
        label={t('administration.createMember.email')}
        type="email"
        autoComplete="email"
        isDisabled={isSubmitting}
        {...register('email')}
      />
      <PasswordInput
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.password)}
        errorMessage={errors.password?.message}
        label={t('administration.createMember.password')}
        autoComplete="new-password"
        isDisabled={isSubmitting}
        hideLabel={t('administration.createMember.hidePassword')}
        showLabel={t('administration.createMember.showPassword')}
        {...register('password')}
      />
      <Controller
        control={control}
        name="roleId"
        rules={{ required: true }}
        render={({ field }) => (
          <Select
            isRequired
            validationBehavior="aria"
            isInvalid={Boolean(errors.roleId)}
            errorMessage={errors.roleId?.message}
            isDisabled={isSubmitting}
            label={t('administration.createMember.role')}
            placeholder={t('administration.select')}
            name={field.name}
            selectedKeys={field.value ? [field.value] : []}
            onSelectionChange={(keys) =>
              field.onChange(Array.from(keys)[0] ?? '')
            }
            onBlur={field.onBlur}
          >
            {selectableRoles.map((role) => (
              <SelectItem key={role.id}>{role.name}</SelectItem>
            ))}
          </Select>
        )}
      />
    </FormModalDialog>
  );
};
