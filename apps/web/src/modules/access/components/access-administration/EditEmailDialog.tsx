import {
  Button,
  FieldError,
  Input,
  Label,
  Modal,
  TextField,
} from '@heroui/react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

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
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Modal.Container size="lg" scroll="inside">
        <Modal.Dialog>
          <form onSubmit={handleSubmit(submit)} noValidate>
            <Modal.Header>
              <Modal.Heading>
                {t('administration.editEmail.title', {
                  email: member.email,
                })}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <TextField
                isRequired
                validationBehavior="aria"
                isDisabled={isSubmitting}
                isInvalid={Boolean(errors.email)}
              >
                <Label>{t('administration.editEmail.email')}</Label>
                <Input
                  autoFocus
                  type="email"
                  autoComplete="email"
                  {...register('email')}
                />
                <FieldError>{errors.email?.message}</FieldError>
              </TextField>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="ghost"
                isDisabled={isSubmitting}
                onPress={onClose}
              >
                {t('administration.cancel')}
              </Button>
              <Button variant="primary" type="submit" isPending={isSubmitting}>
                {t('administration.editEmail.save')}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};
