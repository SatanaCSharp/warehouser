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

import { parseCreateMemberForm } from 'modules/access/schemas/create-member-form';

import type { CreateMemberInput } from '@warehouser/contracts/users';
import type {
  AccessRole,
  MutationOutcome,
} from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

type CreateMemberDialogProps = {
  roles: AccessRole[];
  onClose: () => void;
  onSave: (input: CreateMemberInput) => Promise<MutationOutcome>;
};

type CreateMemberForm = { email: string; password: string; roleId: string };

export const CreateMemberDialog = ({
  roles,
  onClose,
  onSave,
}: CreateMemberDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<CreateMemberForm>({
    defaultValues: { email: '', password: '', roleId: '' },
  });

  const selectableRoles = roles.filter(
    (role) => role.kind !== 'warehouse_manager',
  );

  const submit = async ({
    email,
    password,
    roleId,
  }: CreateMemberForm): Promise<void> => {
    const parsed = parseCreateMemberForm(email, password, roleId);
    if (!parsed.success) {
      if (parsed.error.email) {
        setError('email', {
          message: t(
            `administration.createMember.validation.email.${parsed.error.email}`,
          ),
        });
      }
      if (parsed.error.password) {
        setError('password', {
          message: t(
            `administration.createMember.validation.password.${parsed.error.password}`,
          ),
        });
      }
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
          `administration.createMember.validation.email.${result.fieldErrors.email}`,
        ),
      });
    }
    if (result.fieldErrors?.roleId) {
      setError('roleId', {
        message: t(
          `administration.createMember.validation.role.${result.fieldErrors.roleId}`,
        ),
      });
    }
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
          <ModalHeader>{t('administration.createMember.title')}</ModalHeader>
          <ModalBody>
            <Input
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
            <Input
              isRequired
              validationBehavior="aria"
              isInvalid={Boolean(errors.password)}
              errorMessage={errors.password?.message}
              label={t('administration.createMember.password')}
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
            <label>
              {t('administration.createMember.role')}
              <select
                required
                {...register('roleId', { required: true })}
                className="mt-2 w-full rounded-medium border border-divider p-3"
              >
                <option value="">{t('administration.select')}</option>
                {selectableRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            {errors.roleId?.message ? (
              <p className="text-sm text-danger">{errors.roleId.message}</p>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" isDisabled={isSubmitting} onPress={onClose}>
              {t('administration.cancel')}
            </Button>
            <Button color="primary" type="submit" isLoading={isSubmitting}>
              {t('administration.createMember.save')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};
