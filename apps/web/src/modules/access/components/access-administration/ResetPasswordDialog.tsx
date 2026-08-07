import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormModalDialog } from 'modules/access/components/access-administration/FormModalDialog';
import { parsePasswordChangeForm } from 'modules/access/schemas/password-change-form';
import { PasswordInput } from 'shared/components/PasswordInput';

import type { PasswordChangeInput } from '@warehouser/contracts/users';
import type {
  AccessMember,
  MutationOutcome,
} from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

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

  const submit = async ({ password }: ResetPasswordForm): Promise<void> => {
    const parsed = parsePasswordChangeForm(password);
    if (!parsed.success) {
      setError('password', {
        message: t(
          `administration.resetPassword.validation.${parsed.error.password}`,
        ),
      });
      return;
    }

    const result = await onSave(parsed.data);
    if (result.success) {
      onClose();
      return;
    }
    if (result.fieldErrors?.password) {
      setError('password', {
        message: t(
          `administration.resetPassword.validation.${result.fieldErrors.password}`,
        ),
      });
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
      scrollBehavior="inside"
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
