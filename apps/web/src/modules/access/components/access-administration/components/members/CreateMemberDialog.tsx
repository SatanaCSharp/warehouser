import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useFormFieldErrors } from 'modules/access/hooks/useFormFieldErrors';
import { parseCreateMemberForm } from 'modules/access/schemas/create-member-form';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormSelectField } from 'shared/components/FormSelectField';
import { FormTextField } from 'shared/components/FormTextField';
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
  const { setFieldErrors } = useFormFieldErrors<CreateMemberForm>(setError);

  const validationNamespace: Record<keyof CreateMemberForm, string> = {
    email: 'email',
    password: 'password',
    roleId: 'role',
  };

  const translateValidation = (
    field: keyof CreateMemberForm,
    code: string,
  ): string =>
    t(
      `administration.createMember.validation.${validationNamespace[field]}.${code}`,
    );

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
      setFieldErrors(
        { email: parsed.error.email, password: parsed.error.password },
        translateValidation,
      );
      return;
    }

    const result = await onSave(parsed.data);
    if (result.success) {
      onClose();
      return;
    }
    setFieldErrors(
      { email: result.fieldErrors?.email, roleId: result.fieldErrors?.roleId },
      translateValidation,
    );
  };

  return (
    <FormModalDialog
      title={t('administration.createMember.title')}
      cancelLabel={t('administration.cancel')}
      submitLabel={t('administration.createMember.save')}
      size="lg"
      scroll="inside"
      noValidate
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
    >
      <FormTextField
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
          <FormSelectField
            isRequired
            validationBehavior="aria"
            isInvalid={Boolean(errors.roleId)}
            errorMessage={errors.roleId?.message}
            isDisabled={isSubmitting}
            label={t('administration.createMember.role')}
            placeholder={t('administration.select')}
            name={field.name}
            options={selectableRoles.map((role) => ({
              id: role.id,
              label: role.name,
            }))}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
    </FormModalDialog>
  );
};
