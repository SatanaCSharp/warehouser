import { Button, Input } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
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
  const [passwordVisible, setPasswordVisible] = useState(false);
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
      <Input
        label={t('form.password.label')}
        placeholder={t('form.password.placeholder')}
        description={t('form.password.help')}
        type={passwordVisible ? 'text' : 'password'}
        autoComplete="current-password"
        isDisabled={isSubmitting}
        isInvalid={Boolean(errors.password)}
        errorMessage={
          errors.password?.message
            ? translateValidation(errors.password.message)
            : undefined
        }
        endContent={
          <button
            type="button"
            className="min-h-11 min-w-11 text-sm text-foreground-500"
            aria-label={
              passwordVisible
                ? t('form.password.hide')
                : t('form.password.show')
            }
            onClick={() => setPasswordVisible((visible) => !visible)}
          >
            {passwordVisible
              ? t('form.password.hideShort')
              : t('form.password.showShort')}
          </button>
        }
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
