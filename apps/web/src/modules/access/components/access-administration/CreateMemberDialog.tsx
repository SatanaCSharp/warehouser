import { Input } from '@heroui/react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormModalDialog } from 'modules/access/components/access-administration/FormModalDialog';
import { parseCreateMemberForm } from 'modules/access/schemas/create-member-form';
import { PasswordInput } from 'shared/components/PasswordInput';

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
    <FormModalDialog
      title={t('administration.createMember.title')}
      cancelLabel={t('administration.cancel')}
      submitLabel={t('administration.createMember.save')}
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
        label={t('administration.createMember.email')}
        type="email"
        autoComplete="email"
        isDisabled={isSubmitting}
        {...register('email')}
      />
      <PasswordInput
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.password)}
        errorMessage={errors.password?.message}
        label={t('administration.createMember.password')}
        autoComplete="new-password"
        isDisabled={isSubmitting}
        hideLabel={t('administration.createMember.hidePassword')}
        showLabel={t('administration.createMember.showPassword')}
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
    </FormModalDialog>
  );
};
