import { Button, Input } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
  loginFormSchema,
  type LoginFormValues,
} from 'modules/auth/login/schemas/login-form.schema';
import { PasswordInput } from 'shared/components/PasswordInput';

import type { ReactElement } from 'react';

type Props = {
  onSubmit: (values: LoginFormValues) => void | Promise<void>;
};

export const LoginForm = ({ onSubmit }: Props): ReactElement => {
  const { t } = useTranslation('sign-in');
  const { t: translateValidation } = useTranslation('validation');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    shouldFocusError: true,
  });

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      className="flex flex-col gap-4"
      noValidate
    >
      <Input
        label={t('form.email.label')}
        placeholder={t('form.email.placeholder')}
        description={t('form.email.help')}
        type="email"
        autoComplete="email"
        isDisabled={isSubmitting}
        isInvalid={Boolean(errors.email)}
        errorMessage={
          errors.email?.message
            ? translateValidation(errors.email.message)
            : undefined
        }
        {...register('email')}
      />
      <PasswordInput
        label={t('form.password.label')}
        placeholder={t('form.password.placeholder')}
        description={t('form.password.help')}
        autoComplete="current-password"
        isDisabled={isSubmitting}
        isInvalid={Boolean(errors.password)}
        errorMessage={
          errors.password?.message
            ? translateValidation(errors.password.message)
            : undefined
        }
        hideLabel={t('form.password.hide')}
        showLabel={t('form.password.show')}
        hideText={t('form.password.hideShort')}
        showText={t('form.password.showShort')}
        {...register('password')}
      />
      <Button
        type="submit"
        aria-label={isSubmitting ? t('form.submitting') : t('form.submit')}
        color="primary"
        className="min-h-11 w-full font-semibold"
        isLoading={isSubmitting}
        isDisabled={isSubmitting}
      >
        {isSubmitting ? t('form.submitting') : t('form.submit')}
      </Button>
    </form>
  );
};
