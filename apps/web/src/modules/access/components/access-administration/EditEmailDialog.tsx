import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
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
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      size="lg"
      scrollBehavior="inside"
    >
      <ModalContent>
        <form onSubmit={handleSubmit(submit)} noValidate>
          <ModalHeader>
            {t('administration.editEmail.title', { email: member.email })}
          </ModalHeader>
          <ModalBody>
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
          </ModalBody>
          <ModalFooter>
            <Button variant="light" isDisabled={isSubmitting} onPress={onClose}>
              {t('administration.cancel')}
            </Button>
            <Button color="primary" type="submit" isLoading={isSubmitting}>
              {t('administration.editEmail.save')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};
