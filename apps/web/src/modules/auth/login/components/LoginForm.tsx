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
      <TextField isDisabled={isSubmitting} isInvalid={Boolean(errors.email)}>
        <Label>{t('form.email.label')}</Label>
        <Input
          placeholder={t('form.email.placeholder')}
          type="email"
          autoComplete="email"
          {...register('email')}
        />
        <Description>{t('form.email.help')}</Description>
        <FieldError>
          {errors.email?.message
            ? translateValidation(errors.email.message)
            : undefined}
        </FieldError>
      </TextField>
      <TextField isDisabled={isSubmitting} isInvalid={Boolean(errors.password)}>
        <Label>{t('form.password.label')}</Label>
        <InputGroup>
          <InputGroup.Input
            placeholder={t('form.password.placeholder')}
            type={passwordVisible ? 'text' : 'password'}
            autoComplete="current-password"
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
              {passwordVisible
                ? t('form.password.hideShort')
                : t('form.password.showShort')}
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
