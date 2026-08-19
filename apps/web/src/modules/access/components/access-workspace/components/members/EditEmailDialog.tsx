import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { parseEmailChangeForm } from 'modules/access/schemas/email-change-form';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

import type { EmailChangeInput } from '@warehouser/contracts/users';
import type { AccessMember } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import type { FormParseResult } from 'shared/utils/form-parse';

type EditEmailDialogProps = {
  member: Pick<AccessMember, 'email' | 'userId'>;
  onSave: (input: EmailChangeInput) => Promise<MutationResult>;
};

type EditEmailForm = { email: string };

export const EditEmailDialog = ({
  member,
  onSave,
}: EditEmailDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const form = useForm<EditEmailForm>({ defaultValues: { email: '' } });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;

  const translateValidation = (code: string): string =>
    t(`administration.editEmail.validation.${code}`);

  const parse = ({
    email,
  }: EditEmailForm): FormParseResult<EditEmailForm, EmailChangeInput> =>
    parseEmailChangeForm(email);

  return (
    <FormModalDialog
      title={t('administration.editEmail.title', { email: member.email })}
      cancelLabel={t('administration.cancel')}
      submitLabel={t('administration.editEmail.save')}
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
        label={t('administration.editEmail.email')}
        type="email"
        autoComplete="email"
        isDisabled={isSubmitting}
        {...register('email')}
      />
    </FormModalDialog>
  );
};
