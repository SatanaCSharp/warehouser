import { Card } from '@heroui/react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useSignInMutation } from 'modules/auth/api/auth-api';
import { LoginForm } from 'modules/auth/login/components/LoginForm';
import { authBecameAuthenticated } from 'modules/auth/store/auth.slice';
import { Conditional } from 'shared/components/Conditional';
import { ROUTES } from 'shared/constants/routes';
import { useAppDispatch } from 'store/hooks';

import type { LoginFormValues } from 'modules/auth/login/schemas/login-form.schema';
import type { ReactElement } from 'react';

export const LoginPage = (): ReactElement => {
  const { t } = useTranslation('sign-in');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { reason } = useSearch({ from: ROUTES.LOGIN });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [signIn] = useSignInMutation();

  useEffect(() => {
    if (reason === 'session-ended') {
      headingRef.current?.focus();
    }
  }, [reason]);

  const handleSubmit = async (values: LoginFormValues): Promise<void> => {
    const result = await signIn(values);
    if ('error' in result) {
      return;
    }

    dispatch(authBecameAuthenticated(result.data.user));
    await navigate({ to: ROUTES.HOME });
  };

  return (
    <main className="mx-auto grid min-h-[calc(100dvh-68px)] max-w-5xl items-center gap-12 px-6 py-10 sm:min-h-[calc(100dvh-80px)] lg:grid-cols-[1fr_460px] lg:px-8">
      <section className="hidden lg:block">
        <p className="mb-6 inline-flex rounded-full bg-accent-soft px-3 py-2 text-sm font-semibold text-accent-soft-foreground">
          {t('intro.eyebrow')}
        </p>
        <h1 className="max-w-md text-5xl font-bold leading-tight">
          {t('intro.title')}
        </h1>
        <p className="mt-6 max-w-md text-lg text-muted">
          {t('intro.description')}
        </p>
        <ul className="mt-8 space-y-4 text-sm">
          <li>{t('intro.user')}</li>
          <li>{t('intro.session')}</li>
          <li>{t('intro.authorization')}</li>
        </ul>
      </section>
      <Card className="w-full max-w-[460px] justify-self-center border border-border shadow-md max-[719px]:border-0 max-[719px]:bg-transparent max-[719px]:shadow-none">
        <Card.Header className="flex-col items-start gap-1 px-6 pt-8 sm:px-8">
          <p className="mb-2 rounded-full bg-accent-soft px-3 py-2 text-sm font-semibold text-accent-soft-foreground lg:hidden">
            {t('intro.eyebrow')}
          </p>
          <h2
            ref={headingRef}
            className="text-3xl font-bold outline-none"
            tabIndex={reason === 'session-ended' ? -1 : undefined}
          >
            {t('title')}
          </h2>
          <p className="text-muted">{t('description')}</p>
          <Conditional when={reason === 'session-ended'}>
            <p className="mt-3 rounded-lg bg-warning-soft p-3 text-sm text-warning-soft-foreground">
              {t('sessionEnded')}
            </p>
          </Conditional>
        </Card.Header>
        <Card.Content className="gap-5 px-6 pb-8 sm:px-8">
          <LoginForm onSubmit={handleSubmit} />
          <div className="rounded-lg border border-border p-3 text-sm">
            <p>{t('mobile.sameUser')}</p>
            <p className="mt-2">{t('mobile.session')}</p>
          </div>
          <p className="text-center text-xs text-muted">{t('accessibility')}</p>
        </Card.Content>
      </Card>
    </main>
  );
};
