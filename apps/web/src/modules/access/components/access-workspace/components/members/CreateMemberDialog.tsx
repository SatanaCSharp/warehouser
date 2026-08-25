import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { parseCreateMemberForm } from 'modules/access/schemas/create-member-form';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormSelectField } from 'shared/components/FormSelectField';
import { FormTextField } from 'shared/components/FormTextField';
import { PasswordInput } from 'shared/components/PasswordInput';

import type { CreateMemberInput } from '@warehouser/contracts/users';
import type { AccessRole } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import type { FormParseResult } from 'shared/utils/form-parse';

type CreateMemberDialogProps = {
  roles: AccessRole[];
  onSave: (input: CreateMemberInput) => Promise<MutationResult>;
};

type CreateMemberForm = { email: string; password: string; roleId: string };

/** Which validation namespace explains each field's rejection. */
const VALIDATION_NAMESPACE: Record<keyof CreateMemberForm, string> = {
  email: 'email',
  password: 'password',
  roleId: 'role',
};

export const CreateMemberDialog = ({
  roles,
  onSave,
}: CreateMemberDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const form = useForm<CreateMemberForm>({
    defaultValues: { email: '', password: '', roleId: '' },
  });
  const {
    control,
    formState: { errors, isSubmitting },
    register,
  } = form;

  const translateValidation = (
    code: string,
    field: keyof CreateMemberForm,
  ): string =>
    t(
      `administration.createMember.validation.${VALIDATION_NAMESPACE[field]}.${code}`,
    );

  const parse = ({
    email,
    password,
    roleId,
  }: CreateMemberForm): FormParseResult<CreateMemberForm, CreateMemberInput> =>
    parseCreateMemberForm(email, password, roleId);

  const selectableRoles = roles.filter(
    (role) => role.kind !== 'warehouse_manager',
  );

  return (
    <FormModalDialog
      title={t('administration.createMember.title')}
      cancelLabel={t('administration.cancel')}
      submitLabel={t('administration.createMember.save')}
      size="lg"
      scroll="inside"
      form={form}
      parse={parse}
      translateValidation={translateValidation}
      onSubmit={onSave}
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
        // A bare `required: true` sets an error whose message is the empty
        // string, so the dialog refused to submit while rendering nothing to
        // explain why — and because `handleSubmit` never ran, the email and
        // password were never validated either. The message makes the refusal
        // visible and keeps it on the same translated path as the other fields.
        rules={{ required: translateValidation('required', 'roleId') }}
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
