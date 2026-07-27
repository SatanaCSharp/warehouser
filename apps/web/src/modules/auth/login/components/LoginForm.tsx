import { Button, Input } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
  loginFormSchema,
  type LoginFormValues,
} from 'modules/auth/login/schemas/login-form.schema';

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
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginFormSchema) });

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      className="flex max-w-sm flex-col gap-4 p-6"
    >
      <Input
        label={t('form.email.label')}
        type="text"
        isInvalid={Boolean(errors.email)}
        errorMessage={
          errors.email?.message
            ? translateValidation(errors.email.message)
            : undefined
        }
        {...register('email')}
      />
      <Input
        label={t('form.password.label')}
        type="password"
        isInvalid={Boolean(errors.password)}
        errorMessage={
          errors.password?.message
            ? translateValidation(errors.password.message)
            : undefined
        }
        {...register('password')}
      />
      <Button type="submit" color="primary" isLoading={isSubmitting}>
        {t('form.submit')}
      </Button>
    </form>
  );
};
