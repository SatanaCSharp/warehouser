import { toast } from 'react-toastify';

import i18n from 'i18n';

export const alertSignUpSuccess = (): void => {
  toast.success(i18n.t('auth.signUp', { ns: 'success' }), {
    toastId: 'auth:sign-up-success',
  });
};

export const alertSignInSuccess = (): void => {};

export const alertSignOutSuccess = (): void => {
  toast.success(i18n.t('auth.signOut', { ns: 'success' }), {
    toastId: 'auth:sign-out-success',
  });
};
