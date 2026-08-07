import { Button } from '@heroui/react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { alertSignOutSuccess } from 'modules/auth/alerts/auth-feedback';
import { useSignOutMutation } from 'modules/auth/api/auth-api';
import { authBecameAnonymous } from 'modules/auth/store/auth.slice';
import { ROUTES } from 'shared/constants/routes';
import { useAppDispatch } from 'store/hooks';

import type { ReactElement } from 'react';

const LogOutIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    className="size-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15M3 12h13.5m0 0-3.75-3.75M16.5 12l-3.75 3.75"
    />
  </svg>
);

export const SignOutButton = (): ReactElement => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [signOut, { isLoading: isSigningOut }] = useSignOutMutation();

  const handleSignOut = async (): Promise<void> => {
    const result = await signOut();
    if ('error' in result) {
      return;
    }

    dispatch(authBecameAnonymous());
    alertSignOutSuccess();
    await navigate({ to: ROUTES.LOGIN, search: {} });
  };

  const label = isSigningOut ? t('auth.signingOut') : t('auth.signOut');

  return (
    <Button
      color="primary"
      variant="bordered"
      className="min-h-11 w-10 min-w-10 gap-0 px-0 sm:w-auto sm:min-w-20 sm:gap-2 sm:px-4"
      aria-label={label}
      startContent={isSigningOut ? null : <LogOutIcon />}
      isDisabled={isSigningOut}
      isLoading={isSigningOut}
      onPress={() => void handleSignOut()}
    >
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
};
