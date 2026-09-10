import type { AccessPermission } from 'modules/access/types/access.types';
import { useTranslation } from 'react-i18next';
import { permissionTranslationKey } from 'shared/utils/translation-key';

/**
 * Names a Permission in the actor's language, falling back to the label the
 * server sent for a Permission this build has no translation for yet.
 */
export const usePermissionLabel = (): ((
  permission: AccessPermission,
) => string) => {
  const { t } = useTranslation('access');

  return (permission) =>
    t(permissionTranslationKey('permissions', permission.id), permission.label);
};
