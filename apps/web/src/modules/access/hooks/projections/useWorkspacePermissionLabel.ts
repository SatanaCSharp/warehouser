import type { WorkspacePermission } from '@warehouser/contracts/workspaces';
import { useTranslation } from 'react-i18next';
import { permissionTranslationKey } from 'shared/utils/translation-key';

/**
 * Names a Workspace Permission in the actor's language, falling back to the
 * label the server sent for a catalogue entry this build has no translation
 * for yet. The catalogue is system-managed (AC-18), so the identifier — never
 * the label — is what the UI keys off.
 */
export const useWorkspacePermissionLabel = (): ((
  permission: WorkspacePermission,
) => string) => {
  const { t } = useTranslation('access');

  return (permission) =>
    t(
      permissionTranslationKey('workspacePermissions', permission.id),
      permission.label,
    );
};
