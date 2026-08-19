import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { parsePasswordChangeForm } from 'modules/access/schemas/password-change-form';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { PasswordInput } from 'shared/components/PasswordInput';

import type { PasswordChangeInput } from '@warehouser/contracts/users';
import type { AccessMember } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import type { FormParseResult } from 'shared/utils/form-parse';

type ResetPasswordDialogProps = {
  member: Pick<AccessMember, 'email' | 'userId'>;
  onSave: (input: PasswordChangeInput) => Promise<MutationResult>;
};

type ResetPasswordForm = { password: string };

export const ResetPasswordDialog = ({
  member,
  onSave,
}: ResetPasswordDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const form = useForm<ResetPasswordForm>({ defaultValues: { password: '' } });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;

  const translateValidation = (code: string): string =>
    t(`administration.resetPassword.validation.${code}`);

  const parse = ({
    password,
  }: ResetPasswordForm): FormParseResult<
    ResetPasswordForm,
    PasswordChangeInput
  > => parsePasswordChangeForm(password);

  return (
    <FormModalDialog
      title={t('administration.resetPassword.title', { email: member.email })}
      cancelLabel={t('administration.cancel')}
      submitLabel={t('administration.resetPassword.save')}
      size="lg"
      scroll="inside"
      form={form}
      parse={parse}
      translateValidation={translateValidation}
      onSubmit={onSave}
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
