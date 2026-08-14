import { Skeleton } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import {
  useListWorkspacePermissionsQuery,
  useListWorkspaceRolesQuery,
} from 'modules/access/api/workspace-roles-api';
import { CreateWorkspaceRoleAction } from 'modules/access/components/workspace-administration/roles/CreateWorkspaceRoleAction';
import { WorkspaceRoleDirectory } from 'modules/access/components/workspace-administration/roles/WorkspaceRoleDirectory';
import { useHasWorkspacePermission } from 'shared/hooks/useWorkspacePermissions';

import type { ReactElement } from 'react';

/**
 * The Workspace roles tab: the Workspace Role list, the editor for the
 * selected Role, and the dialogs that change it (AC-14 – AC-18, AC-32).
 * Neither the Roles nor the system Permission catalogue is requested without
 * `WORKSPACE_ROLES:WATCH` — a dataset the actor may not read is never fetched
 * or retained.
 */
export const WorkspaceRolesTab = (): ReactElement => {
  const { t } = useTranslation('access');
  const canWatchWorkspaceRoles = useHasWorkspacePermission(
    WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
  );
  const { data: roles } = useListWorkspaceRolesQuery(undefined, {
    skip: !canWatchWorkspaceRoles,
  });
  const { data: permissions } = useListWorkspacePermissionsQuery(undefined, {
    skip: !canWatchWorkspaceRoles,
  });

  // Neither pane renders ahead of the datasets it needs: the editor's
  // Permission rows would otherwise flash in a heartbeat after the list. Reads
  // `undefined` rather than a query's own `isLoading`, which still reads
  // `false` for the one render where a newly un-skipped query has not started
  // fetching yet.
  if (!roles || !permissions) {
    return (
      <div aria-label={t('workspaceRoles.loading')} className="space-y-3">
        {[0, 1, 2].map((skeletonId) => (
          <Skeleton className="h-[72px] rounded-xl" key={skeletonId} />
        ))}
      </div>
    );
  }

  return (
    <section aria-label={t('workspaceRoles.heading')}>
      <div className="mb-5 flex flex-wrap justify-end gap-2">
        <CreateWorkspaceRoleAction permissions={permissions} />
      </div>
      <WorkspaceRoleDirectory permissions={permissions} roles={roles} />
    </section>
  );
};
