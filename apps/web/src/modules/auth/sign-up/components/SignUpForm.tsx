import {
  Button,
  Description,
  FieldError,
  Input,
  InputGroup,
  Label,
  TextField,
} from '@heroui/react';
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
      <TextField isDisabled={isSubmitting} isInvalid={Boolean(emailMessage)}>
        <Label>{t('form.email.label')}</Label>
        <Input
          placeholder={t('form.email.placeholder')}
          type="email"
          autoComplete="email"
          {...register('email')}
        />
        <Description>{t('form.email.help')}</Description>
        <FieldError>{emailMessage}</FieldError>
      </TextField>
      {emailError ? (
        <RouterLink to={ROUTES.LOGIN} className="link text-accent">
          {t('duplicate.signIn')}
        </RouterLink>
      ) : null}
      <TextField isDisabled={isSubmitting} isInvalid={Boolean(errors.password)}>
        <Label>{t('form.password.label')}</Label>
        <InputGroup>
          <InputGroup.Input
            placeholder={t('form.password.placeholder')}
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
                  ? t('form.password.hide')
                  : t('form.password.show')
              }
              onPress={() => setPasswordVisible((visible) => !visible)}
            >
              {passwordVisible ? 'Hide' : 'Show'}
            </Button>
          </InputGroup.Suffix>
        </InputGroup>
        <Description>{t('form.password.help')}</Description>
        <FieldError>
          {errors.password?.message
            ? translateValidation(errors.password.message)
            : undefined}
        </FieldError>
      </TextField>
      <TextField
        isDisabled={isSubmitting}
        isInvalid={Boolean(errors.warehouseName)}
      >
        <Label>{t('form.warehouseName.label')}</Label>
        <Input
          placeholder={t('form.warehouseName.placeholder')}
          autoComplete="organization"
          {...register('warehouseName')}
        />
        <Description>{t('form.warehouseName.help')}</Description>
        <FieldError>
          {errors.warehouseName?.message
            ? translateValidation(errors.warehouseName.message)
            : undefined}
        </FieldError>
      </TextField>
      <Button
        type="submit"
        aria-label={isSubmitting ? t('form.submitting') : t('form.submit')}
        variant="primary"
        className="min-h-11 w-full font-semibold"
        isPending={isSubmitting}
        isDisabled={isSubmitting}
      >
        {isSubmitting ? t('form.submitting') : t('form.submit')}
      </Button>
    </form>
  );
};
