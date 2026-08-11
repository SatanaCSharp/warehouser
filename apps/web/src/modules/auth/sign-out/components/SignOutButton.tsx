import { Button } from '@heroui/react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { alertSignOutAction } from 'modules/auth/alerts/auth-feedback';
import { useSignOutMutation } from 'modules/auth/api/auth-api';
import { authBecameAnonymous } from 'modules/auth/store/auth.slice';
import { ROUTES } from 'shared/constants/routes';
import { LogOutIcon } from 'shared/icons';
import { useAppDispatch } from 'store/hooks';

import type { ReactElement } from 'react';

export const SignOutButton = (): ReactElement => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [signOut, { isLoading: isSigningOut }] = useSignOutMutation();

  const handleSignOut = async (): Promise<void> => {
    const result = await alertSignOutAction(signOut());
    if ('error' in result) {
      return;
    }

    dispatch(authBecameAnonymous());
    await navigate({ to: ROUTES.LOGIN, search: {} });
  };

  const label = isSigningOut ? t('auth.signingOut') : t('auth.signOut');

  return (
    <Button
      variant="outline"
      className="min-h-11 w-10 min-w-10 gap-0 px-0 sm:w-auto sm:min-w-20 sm:gap-2 sm:px-4"
      aria-label={label}
      isDisabled={isSigningOut}
      isPending={isSigningOut}
      onPress={() => void handleSignOut()}
    >
      {isSigningOut ? null : <LogOutIcon />}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
};
