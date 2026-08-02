import { Card, CardBody, CardHeader } from '@heroui/react';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { alertSignUpSuccess } from 'modules/auth/alerts/auth-feedback';
import { useSignUpMutation } from 'modules/auth/api/auth-api';
import { SignUpForm } from 'modules/auth/sign-up/components/SignUpForm';
import { authBecameAuthenticated } from 'modules/auth/store/auth.slice';
import { isApiFailure } from 'shared/api/api-client';
import { ROUTES } from 'shared/constants/routes';
import { useAppDispatch } from 'store/hooks';

import type { SignUpFormValues } from 'modules/auth/sign-up/schemas/sign-up-form.schema';
import type { ReactElement } from 'react';

export const SignUpPage = (): ReactElement => {
  const { t } = useTranslation('sign-up');
  const { t: translateErrors } = useTranslation('errors');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [emailError, setEmailError] = useState<string>();
  const [signUp] = useSignUpMutation();

  const handleSubmit = async (values: SignUpFormValues): Promise<void> => {
    setEmailError(undefined);

    const result = await signUp(values);
    if ('error' in result) {
      if (
        isApiFailure(result.error) &&
        result.error.code === 'auth.email_already_registered'
      ) {
        setEmailError(translateErrors('auth.emailAlreadyRegistered'));
      }
      return;
    }

    dispatch(authBecameAuthenticated(result.data.user));
    alertSignUpSuccess();
    await navigate({ to: ROUTES.HOME });
  };

  return (
    <main className="mx-auto grid min-h-[calc(100dvh-68px)] max-w-5xl items-center gap-12 px-6 py-10 sm:min-h-[calc(100dvh-80px)] lg:grid-cols-[1fr_460px] lg:px-8">
      <section className="hidden lg:block">
        <p className="mb-6 inline-flex rounded-full bg-primary-50 px-3 py-2 text-sm font-semibold text-primary">
          {t('intro.eyebrow')}
        </p>
        <h1 className="max-w-md text-5xl font-bold leading-tight">
          {t('intro.title')}
        </h1>
        <p className="mt-6 max-w-md text-lg text-foreground-500">
          {t('intro.description')}
        </p>
        <ul className="mt-8 space-y-4 text-sm">
          <li>{t('intro.account')}</li>
          <li>{t('intro.password')}</li>
          <li>{t('intro.session')}</li>
        </ul>
      </section>
      <Card className="w-full max-w-[460px] justify-self-center border border-divider shadow-medium max-sm:bg-transparent max-sm:shadow-none">
        <CardHeader className="flex-col items-start gap-1 px-6 pt-8 sm:px-8">
          <h2 className="text-3xl font-bold">{t('title')}</h2>
          <p className="text-foreground-500">{t('description')}</p>
        </CardHeader>
        <CardBody className="gap-5 px-6 pb-8 sm:px-8">
          <SignUpForm emailError={emailError} onSubmit={handleSubmit} />
          <p className="rounded-medium bg-content2 p-3 text-sm text-foreground-500">
            {t('confidentiality')}
          </p>
          <p className="text-center text-xs text-foreground-500">
            {t('accessibility')}
          </p>
        </CardBody>
      </Card>
    </main>
  );
};
