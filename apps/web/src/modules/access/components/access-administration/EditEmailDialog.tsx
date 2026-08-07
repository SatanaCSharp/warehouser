import { Input } from '@heroui/react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormModalDialog } from 'modules/access/components/access-administration/FormModalDialog';
import { parseEmailChangeForm } from 'modules/access/schemas/email-change-form';

import type { EmailChangeInput } from '@warehouser/contracts/users';
import type {
  AccessMember,
  MutationOutcome,
} from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

type EditEmailDialogProps = {
  member: Pick<AccessMember, 'email' | 'userId'>;
  onClose: () => void;
  onSave: (input: EmailChangeInput) => Promise<MutationOutcome>;
};

type EditEmailForm = { email: string };

export const EditEmailDialog = ({
  member,
  onClose,
  onSave,
}: EditEmailDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<EditEmailForm>({ defaultValues: { email: '' } });

  const submit = async ({ email }: EditEmailForm): Promise<void> => {
    const parsed = parseEmailChangeForm(email);
    if (!parsed.success) {
      setError('email', {
        message: t(`administration.editEmail.validation.${parsed.error.email}`),
      });
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
          `administration.editEmail.validation.${result.fieldErrors.email}`,
        ),
      });
      return;
    }
    onClose();
  };

  return (
    <FormModalDialog
      title={t('administration.editEmail.title', { email: member.email })}
      cancelLabel={t('administration.cancel')}
      submitLabel={t('administration.editEmail.save')}
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
        label={t('administration.editEmail.email')}
        type="email"
        autoComplete="email"
        isDisabled={isSubmitting}
        {...register('email')}
      />
    </FormModalDialog>
  );
};
