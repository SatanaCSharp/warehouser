import {
  Button,
  FieldError,
  Input,
  InputGroup,
  Label,
  Modal,
  TextField,
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
                {t('administration.createMember.title')}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <TextField
                isRequired
                validationBehavior="aria"
                isDisabled={isSubmitting}
                isInvalid={Boolean(errors.email)}
              >
                <Label>{t('administration.createMember.email')}</Label>
                <Input
                  autoFocus
                  type="email"
                  autoComplete="email"
                  {...register('email')}
                />
                <FieldError>{errors.email?.message}</FieldError>
              </TextField>
              <TextField
                isRequired
                validationBehavior="aria"
                isDisabled={isSubmitting}
                isInvalid={Boolean(errors.password)}
              >
                <Label>{t('administration.createMember.password')}</Label>
                <InputGroup>
                  <InputGroup.Input
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
              <label>
                {t('administration.createMember.role')}
                <select
                  required
                  {...register('roleId', { required: true })}
                  className="mt-2 w-full rounded-lg border border-border p-3"
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
                {t('administration.createMember.save')}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};
