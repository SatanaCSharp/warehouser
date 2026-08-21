import { useTranslation } from 'react-i18next';

import { CreateWorkspaceRoleAction } from 'modules/access/components/workspace-administration/roles/CreateWorkspaceRoleAction';
import { WorkspaceRoleDirectory } from 'modules/access/components/workspace-administration/roles/WorkspaceRoleDirectory';
import { WorkspaceListSkeleton } from 'modules/access/components/workspace-administration/WorkspaceListSkeleton';
import { useWorkspacePermissionCatalogue } from 'modules/access/hooks/queries/useWorkspacePermissionCatalogue';
import { useWorkspaceRoles } from 'modules/access/hooks/queries/useWorkspaceRoles';

import type { ReactElement } from 'react';

/**
 * The Workspace roles tab: the Workspace Role list, the editor for the
 * selected Role, and the dialogs that change it (AC-14 – AC-18, AC-32).
 *
 * Both reads own their `WORKSPACE_ROLES:WATCH` gate inside their own hook, so
 * neither the Roles nor the system Permission catalogue is requested or
 * retained for an actor who may not read them, and this tab repeats no `skip`
 * condition.
 *
 * The catalogue is read here only to time the surface: neither pane renders
 * ahead of the datasets it needs, or the editor's Permission rows would flash
 * in a heartbeat after the list. Each component that grants from the catalogue
 * — `CreateWorkspaceRoleAction`, `WorkspaceRoleEditor` — reads it where it uses
 * it, so nothing is threaded down on the way there.
 */
export const WorkspaceRolesTab = (): ReactElement => {
  const { t } = useTranslation('access');
  const { isReady: isCatalogueReady } = useWorkspacePermissionCatalogue();
  const { isReady: areRolesReady, roles } = useWorkspaceRoles();

  if (!areRolesReady || !isCatalogueReady) {
    return <WorkspaceListSkeleton label={t('workspaceRoles.loading')} />;
  }

  return (
    <section aria-label={t('workspaceRoles.heading')}>
      <div className="mb-5 flex flex-wrap justify-end gap-2">
        <CreateWorkspaceRoleAction />
      </div>
      <WorkspaceRoleDirectory roles={roles} />
    </section>
  );
};
