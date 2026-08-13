import { useTranslation } from 'react-i18next';

import type { WorkspacePermission } from '@warehouser/contracts/workspaces';

/**
 * Names a Workspace Permission in the actor's language, falling back to the
 * label the server sent for a catalogue entry this build has no translation
 * for yet. The catalogue is system-managed (AC-18), so the identifier — never
 * the label — is what the UI keys off.
 */
export const useWorkspacePermissionLabel = (): ((
  permission: WorkspacePermission,
) => string) => {
  const { t } = useTranslation('workspace');

  return (permission) =>
    t(`permissions.items.${permission.id.replace(':', '_')}`, permission.label);
};
