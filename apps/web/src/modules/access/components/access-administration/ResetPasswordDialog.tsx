import {
  Button,
  FieldError,
  InputGroup,
  Label,
  Modal,
  TextField,
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
                {t('administration.resetPassword.title', {
                  email: member.email,
                })}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <TextField
                isRequired
                validationBehavior="aria"
                isDisabled={isSubmitting}
                isInvalid={Boolean(errors.password)}
              >
                <Label>{t('administration.resetPassword.password')}</Label>
                <InputGroup>
                  <InputGroup.Input
                    autoFocus
                    type={passwordVisible ? 'text' : 'password'}
                    autoComplete="new-password"
                    {...register('password')}
                  />
                  <InputGroup.Suffix>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11 min-w-11 text-sm"
                      aria-label={
                        passwordVisible
                          ? t('administration.createMember.hidePassword')
                          : t('administration.createMember.showPassword')
                      }
                      onPress={() => setPasswordVisible((visible) => !visible)}
                    >
                      {passwordVisible
                        ? t('administration.createMember.hidePassword')
                        : t('administration.createMember.showPassword')}
                    </Button>
                  </InputGroup.Suffix>
                </InputGroup>
                <FieldError>{errors.password?.message}</FieldError>
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
                {t('administration.resetPassword.save')}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};
