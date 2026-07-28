import { Button } from '@heroui/react';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { completeSignOut } from 'modules/auth/session/session';
import { ApiFailure } from 'shared/api/api-client';
import { ROUTES } from 'shared/constants/routes';
import {
  notifyApiFailure,
  notifySignOutSuccess,
} from 'shared/notifications/auth-feedback';
import { useAppStore } from 'store/hooks';

import type { ReactElement } from 'react';

export const SignOutButton = (): ReactElement => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const store = useAppStore();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async (): Promise<void> => {
    setIsSigningOut(true);
    try {
      await completeSignOut(store);
      notifySignOutSuccess();
      await navigate({ to: ROUTES.LOGIN, search: {} });
    } catch (error) {
      if (!(error instanceof ApiFailure)) {
        throw error;
      }
      notifyApiFailure(error);
    } finally {
      setIsSigningOut(false);
    }
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
