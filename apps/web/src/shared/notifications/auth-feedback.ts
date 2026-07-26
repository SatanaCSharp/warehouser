import { toast } from 'react-toastify';

import { getTranslatedApiError } from 'shared/errors/api-error';
import i18n from 'shared/i18n/i18n';

import type { ApiFailure } from 'shared/api/api-client';

const toastId = (code: string): string => `api-failure:${code}`;

export const notifyApiFailure = (error: ApiFailure): void => {
  const id = toastId(error.code);
  if (toast.isActive(id)) {
    return;
  }

  toast.error(getTranslatedApiError(error, i18n.t), { toastId: id });
};

export const notifySignUpSuccess = (): void => {
  toast.success(i18n.t('success.auth.signUp'), {
    toastId: 'auth:sign-up-success',
  });
};

export const notifySignInSuccess = (): void => {};

export const notifySignOutSuccess = (): void => {
  toast.success(i18n.t('success.auth.signOut'), {
    toastId: 'auth:sign-out-success',
  });
};
