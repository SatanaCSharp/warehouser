import i18n from 'i18n';
import { toast } from 'shared/alerts/toast';
import { getTranslatedApiError } from 'shared/errors/api-error';

import type { ApiFailure } from 'shared/api/api-client';

// The HeroUI queue has no `toastId` equivalent, so the adapter keeps its own
// registry of the failure codes currently on screen. It is what stops one
// failure observed by several layers — or concurrent requests reporting the
// same session expiry — from stacking identical toasts.
const activeFailures = new Set<string>();

export const alertApiFailure = (error: ApiFailure): void => {
  if (activeFailures.has(error.code)) {
    return;
  }

  activeFailures.add(error.code);
  toast.danger(
    getTranslatedApiError(error, (key) => i18n.t(key, { ns: 'errors' })),
    { onClose: () => activeFailures.delete(error.code) },
  );
};
