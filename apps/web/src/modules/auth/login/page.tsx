import { Card, CardBody, CardHeader } from '@heroui/react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { signIn } from 'modules/auth/api/auth-api';
import { LoginForm } from 'modules/auth/login/components/LoginForm';
import { ApiFailure } from 'shared/api/api-client';
import { ROUTES } from 'shared/constants/routes';
import { notifyApiFailure } from 'shared/notifications/auth-feedback';
import { useAppDispatch } from 'store/hooks';
import { authBecameAuthenticated } from 'store/slices/authSlice';

import type { LoginFormValues } from 'modules/auth/login/schemas/login-form.schema';
import type { ReactElement } from 'react';

export const LoginPage = (): ReactElement => {
  const { t } = useTranslation('sign-in');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { reason } = useSearch({ from: ROUTES.LOGIN });
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (reason === 'session-ended') {
      headingRef.current?.focus();
    }
  }, [reason]);

  const handleSubmit = async (values: LoginFormValues): Promise<void> => {
    try {
      const result = await signIn(values);
      dispatch(authBecameAuthenticated(result.user));
      await navigate({ to: ROUTES.HOME });
    } catch (error) {
      if (!(error instanceof ApiFailure)) {
        throw error;
      }
      notifyApiFailure(error);
    }
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
          <li>{t('intro.user')}</li>
          <li>{t('intro.session')}</li>
          <li>{t('intro.authorization')}</li>
        </ul>
      </section>
      <Card className="w-full max-w-[460px] justify-self-center border border-divider shadow-medium max-[719px]:border-0 max-[719px]:bg-transparent max-[719px]:shadow-none">
        <CardHeader className="flex-col items-start gap-1 px-6 pt-8 sm:px-8">
          <p className="mb-2 rounded-full bg-primary-50 px-3 py-2 text-sm font-semibold text-primary lg:hidden">
            {t('intro.eyebrow')}
          </p>
          <h2
            ref={headingRef}
            className="text-3xl font-bold outline-none"
            tabIndex={reason === 'session-ended' ? -1 : undefined}
          >
            {t('title')}
          </h2>
          <p className="text-foreground-500">{t('description')}</p>
          {reason === 'session-ended' ? (
            <p className="mt-3 rounded-medium bg-warning-50 p-3 text-sm text-warning-700">
              {t('sessionEnded')}
            </p>
          ) : null}
        </CardHeader>
        <CardBody className="gap-5 px-6 pb-8 sm:px-8">
          <LoginForm onSubmit={handleSubmit} />
          <div className="rounded-medium border border-divider p-3 text-sm">
            <p>{t('mobile.sameUser')}</p>
            <p className="mt-2">{t('mobile.session')}</p>
          </div>
          <p className="text-center text-xs text-foreground-500">
            {t('accessibility')}
          </p>
        </CardBody>
      </Card>
    </main>
  );
};
