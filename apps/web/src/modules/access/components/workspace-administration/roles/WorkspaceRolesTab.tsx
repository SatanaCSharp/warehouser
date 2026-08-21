import { useTranslation } from 'react-i18next';

import { CreateWorkspaceRoleAction } from 'modules/access/components/workspace-administration/roles/CreateWorkspaceRoleAction';
import { WorkspaceRoleDirectory } from 'modules/access/components/workspace-administration/roles/WorkspaceRoleDirectory';
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
 * It names no wait of its own, and no longer reads the Permission catalogue to
 * time one. `workspaceRoute`'s loader awaits the Roles and the catalogue
 * together before the destination paints, so nothing can arrive after the tab
 * and there is no heartbeat left to hide (`global-loader/change.md` CH-08,
 * CH-14, `sad.md` §4.8). Each component that grants from the catalogue —
 * `CreateWorkspaceRoleAction`, `WorkspaceRoleEditor` — reads it where it uses
 * it, so nothing is threaded down on the way there.
 */
export const WorkspaceRolesTab = (): ReactElement => {
  const { t } = useTranslation('access');
  const { roles } = useWorkspaceRoles();

  return (
    <section aria-label={t('workspaceRoles.heading')}>
      <div className="mb-5 flex flex-wrap justify-end gap-2">
        <CreateWorkspaceRoleAction />
      </div>
      <WorkspaceRoleDirectory roles={roles} />
    </section>
  );
};
