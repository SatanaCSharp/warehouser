import { toast } from 'react-toastify';

import i18n from 'i18n';
import { getTranslatedApiError } from 'shared/errors/api-error';

import type { ApiFailure } from 'shared/api/api-client';

const toastId = (code: string): string => `api-failure:${code}`;

export const alertApiFailure = (error: ApiFailure): void => {
  const id = toastId(error.code);
  if (toast.isActive(id)) {
    return;
  }

  toast.error(
    getTranslatedApiError(error, (key) => i18n.t(key, { ns: 'errors' })),
    { toastId: id },
  );
};
