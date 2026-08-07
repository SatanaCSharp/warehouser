import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { parsePasswordChangeForm } from 'modules/access/schemas/password-change-form';

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
  const [passwordVisible, setPasswordVisible] = useState(false);
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
            {t('administration.resetPassword.title', { email: member.email })}
          </ModalHeader>
          <ModalBody>
            <Input
              autoFocus
              isRequired
              validationBehavior="aria"
              isInvalid={Boolean(errors.password)}
              errorMessage={errors.password?.message}
              label={t('administration.resetPassword.password')}
              type={passwordVisible ? 'text' : 'password'}
              autoComplete="new-password"
              isDisabled={isSubmitting}
              endContent={
                <button
                  type="button"
                  className="min-h-11 min-w-11 text-sm text-foreground-500"
                  aria-label={
                    passwordVisible
                      ? t('administration.createMember.hidePassword')
                      : t('administration.createMember.showPassword')
                  }
                  onClick={() => setPasswordVisible((visible) => !visible)}
                >
                  {passwordVisible
                    ? t('administration.createMember.hidePassword')
                    : t('administration.createMember.showPassword')}
                </button>
              }
              {...register('password')}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" isDisabled={isSubmitting} onPress={onClose}>
              {t('administration.cancel')}
            </Button>
            <Button color="primary" type="submit" isLoading={isSubmitting}>
              {t('administration.resetPassword.save')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};
