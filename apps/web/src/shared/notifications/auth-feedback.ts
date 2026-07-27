import { toast } from 'react-toastify';

import i18n from 'i18n';
import { getTranslatedApiError } from 'shared/errors/api-error';

import type { ApiFailure } from 'shared/api/api-client';

const toastId = (code: string): string => `api-failure:${code}`;

export const notifyApiFailure = (error: ApiFailure): void => {
  const id = toastId(error.code);
  if (toast.isActive(id)) {
    return;
  }

  toast.error(
    getTranslatedApiError(error, (key) => i18n.t(key, { ns: 'errors' })),
    { toastId: id },
  );
};

export const notifySignUpSuccess = (): void => {
  toast.success(i18n.t('auth.signUp', { ns: 'success' }), {
    toastId: 'auth:sign-up-success',
  });
};

export const notifySignInSuccess = (): void => {};

export const notifySignOutSuccess = (): void => {
  toast.success(i18n.t('auth.signOut', { ns: 'success' }), {
    toastId: 'auth:sign-out-success',
  });
};
