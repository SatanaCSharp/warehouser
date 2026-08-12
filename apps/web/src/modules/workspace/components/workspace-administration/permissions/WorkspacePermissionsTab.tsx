import { Chip, Skeleton } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useListWorkspacePermissionsQuery } from 'modules/workspace/api/workspace-roles-api';
import { useWorkspacePermissionLabel } from 'modules/workspace/hooks/useWorkspacePermissionLabel';
import { groupWorkspacePermissions } from 'modules/workspace/hooks/workspace-permission-groups';
import { useHasWorkspacePermission } from 'shared/hooks/useWorkspacePermissions';

import type { ReactElement } from 'react';

/**
 * The read-only Workspace Permission catalogue with its assignable/reserved
 * classification (AC-32). The catalogue is system-managed (AC-18), so this tab
 * offers no control at all — the reserved entry stands in its own group and
 * says why it can never belong to a custom Workspace Role.
 */
export const WorkspacePermissionsTab = (): ReactElement => {
  const { t } = useTranslation('workspace');
  const permissionLabel = useWorkspacePermissionLabel();
  const canWatchWorkspaceRoles = useHasWorkspacePermission(
    WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
  );
  const { data: permissions } = useListWorkspacePermissionsQuery(undefined, {
    skip: !canWatchWorkspaceRoles,
  });

  if (!permissions) {
    return (
      <div aria-label={t('permissions.loading')} className="space-y-3">
        {[0, 1].map((skeletonId) => (
          <Skeleton className="h-16 rounded-lg" key={skeletonId} />
        ))}
      </div>
    );
  }

  return (
    <section aria-label={t('permissions.heading')} className="space-y-6">
      <p className="text-muted">{t('permissions.description')}</p>
      {groupWorkspacePermissions(permissions).map((group) => (
        <div key={group.id}>
          <h3 className="mb-3 font-semibold">
            {t(`permissions.groups.${group.id}`)}
          </h3>
          <ul
            aria-label={t(`permissions.groups.${group.id}`)}
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
                  {permission.kind === 'reserved' ? (
                    <Chip size="sm" variant="soft">
                      {t('permissions.ownerOnly')}
                    </Chip>
                  ) : null}
                </div>
                {permission.kind === 'reserved' ? (
                  <p className="mt-1 text-sm text-muted">
                    {t('permissions.reservedNote')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
};
