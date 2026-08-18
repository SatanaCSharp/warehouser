import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { parsePasswordChangeForm } from 'modules/access/schemas/password-change-form';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { PasswordInput } from 'shared/components/PasswordInput';
import { useFormFieldErrors } from 'shared/hooks/useFormFieldErrors';

import type { PasswordChangeInput } from '@warehouser/contracts/users';
import type { AccessMember } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';
import type { MutationOutcome } from 'shared/api/client/mutation-outcome';

type ResetPasswordDialogProps = {
  member: Pick<AccessMember, 'email' | 'userId'>;
  onClose: () => void;
  onSave: (input: PasswordChangeInput) => Promise<MutationOutcome>;
};

type ResetPasswordForm = { password: string };

export const ResetPasswordDialog = ({
  member,
  onClose,
  onSave,
}: ResetPasswordDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<ResetPasswordForm>({ defaultValues: { password: '' } });
  const { setFieldError } = useFormFieldErrors<ResetPasswordForm>(setError);

  const translateValidation = (code: string): string =>
    t(`administration.resetPassword.validation.${code}`);

  const submit = async ({ password }: ResetPasswordForm): Promise<void> => {
    const parsed = parsePasswordChangeForm(password);

    if (!parsed.success) {
      setFieldError('password', parsed.error.password, translateValidation);
      return;
    }

    const result = await onSave(parsed.data);

    if (result.success) {
      onClose();
      return;
    }

    if (
      setFieldError(
        'password',
        result.fieldErrors?.password,
        translateValidation,
      )
    ) {
      return;
    }
    onClose();
  };

  return (
    <FormModalDialog
      title={t('administration.resetPassword.title', { email: member.email })}
      cancelLabel={t('administration.cancel')}
      submitLabel={t('administration.resetPassword.save')}
      size="lg"
      scroll="inside"
      noValidate
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
    >
      <PasswordInput
        autoFocus
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.password)}
        errorMessage={errors.password?.message}
        label={t('administration.resetPassword.password')}
        autoComplete="new-password"
        isDisabled={isSubmitting}
        hideLabel={t('administration.resetPassword.hidePassword')}
        showLabel={t('administration.resetPassword.showPassword')}
        {...register('password')}
      />
    </FormModalDialog>
  );
};
