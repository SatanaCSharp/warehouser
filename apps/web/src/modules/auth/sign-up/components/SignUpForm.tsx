import { Button, Input, Link } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link as RouterLink } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
  signUpFormSchema,
  type SignUpFormValues,
} from 'modules/auth/sign-up/schemas/sign-up-form.schema';
import { ROUTES } from 'shared/constants/routes';

import type { ReactElement } from 'react';

type Props = {
  emailError?: string;
  onSubmit: (values: SignUpFormValues) => void | Promise<void>;
};

export const SignUpForm = ({ emailError, onSubmit }: Props): ReactElement => {
  const { t } = useTranslation('sign-up');
  const { t: translateValidation } = useTranslation('validation');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpFormSchema),
    shouldFocusError: true,
  });
  const emailMessage = errors.email?.message
    ? translateValidation(errors.email.message)
    : emailError;

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
        isInvalid={Boolean(emailMessage)}
        errorMessage={emailMessage}
        {...register('email')}
      />
      {emailError ? (
        <Link as={RouterLink} to={ROUTES.LOGIN} color="primary">
          {t('duplicate.signIn')}
        </Link>
      ) : null}
      <Input
        label={t('form.password.label')}
        placeholder={t('form.password.placeholder')}
        description={t('form.password.help')}
        type={passwordVisible ? 'text' : 'password'}
        autoComplete="new-password"
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
            {passwordVisible ? 'Hide' : 'Show'}
          </button>
        }
        {...register('password')}
      />
      <Input
        label={t('form.warehouseName.label')}
        placeholder={t('form.warehouseName.placeholder')}
        description={t('form.warehouseName.help')}
        autoComplete="organization"
        isDisabled={isSubmitting}
        isInvalid={Boolean(errors.warehouseName)}
        errorMessage={
          errors.warehouseName?.message
            ? translateValidation(errors.warehouseName.message)
            : undefined
        }
        {...register('warehouseName')}
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
