import { Button } from '@heroui/react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { alertSignOutSuccess } from 'modules/auth/alerts/auth-feedback';
import { useSignOutMutation } from 'modules/auth/api/auth-api';
import { authBecameAnonymous } from 'modules/auth/store/auth.slice';
import { ROUTES } from 'shared/constants/routes';
import { useAppDispatch } from 'store/hooks';

import type { ReactElement } from 'react';

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

  return (
    <Button
      color="primary"
      variant="bordered"
      className="min-h-11"
      isDisabled={isSigningOut}
      isLoading={isSigningOut}
      onPress={() => void handleSignOut()}
    >
      {isSigningOut ? t('auth.signingOut') : t('auth.signOut')}
    </Button>
  );
};
