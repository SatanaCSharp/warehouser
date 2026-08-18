import { Chip, Skeleton } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useListWorkspacePermissionsQuery } from 'modules/access/api/workspace-roles-api';
import { useWorkspacePermissionLabel } from 'modules/access/hooks/projections/useWorkspacePermissionLabel';
import { groupWorkspacePermissions } from 'modules/access/utils/workspace-permission-groups';
import { Conditional } from 'shared/components/Conditional';
import { useHasWorkspacePermission } from 'shared/hooks/queries/useWorkspacePermissions';

import type { ReactElement } from 'react';

/**
 * The read-only Workspace Permission catalogue with its assignable/reserved
 * classification (AC-32). The catalogue is system-managed (AC-18), so this tab
 * offers no control at all — the reserved entry stands in its own group and
 * says why it can never belong to a custom Workspace Role.
 */
export const WorkspacePermissionsTab = (): ReactElement => {
  const { t } = useTranslation('access');
  const permissionLabel = useWorkspacePermissionLabel();
  const canWatchWorkspaceRoles = useHasWorkspacePermission(
    WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
  );
  const { data: permissions } = useListWorkspacePermissionsQuery(undefined, {
    skip: !canWatchWorkspaceRoles,
  });

  if (!permissions) {
    return (
      <div aria-label={t('workspacePermissions.loading')} className="space-y-3">
        {[0, 1].map((skeletonId) => (
          <Skeleton className="h-16 rounded-lg" key={skeletonId} />
        ))}
      </div>
    );
  }

  return (
    <section
      aria-label={t('workspacePermissions.heading')}
      className="space-y-6"
    >
      <p className="text-muted">{t('workspacePermissions.description')}</p>
      {groupWorkspacePermissions(permissions).map((group) => (
        <div key={group.id}>
          <h3 className="mb-3 font-semibold">
            {t(`workspacePermissions.groups.${group.id}`)}
          </h3>
          <ul
            aria-label={t(`workspacePermissions.groups.${group.id}`)}
            className="space-y-3"
          >
            {group.permissions.map((permission) => (
              <li
                className="rounded-lg bg-surface-secondary px-3 py-3"
                key={permission.id}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">
                    {permissionLabel(permission)}
                  </span>
                  <Conditional when={permission.kind === 'reserved'}>
                    <Chip size="sm" variant="soft">
                      {t('workspacePermissions.ownerOnly')}
                    </Chip>
                  </Conditional>
                </div>
                <Conditional when={permission.kind === 'reserved'}>
                  <p className="mt-1 text-sm text-muted">
                    {t('workspacePermissions.reservedNote')}
                  </p>
                </Conditional>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
};
