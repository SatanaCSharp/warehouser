import { Chip } from '@heroui/react';
import { useWorkspacePermissionLabel } from 'modules/access/hooks/projections/useWorkspacePermissionLabel';
import { useWorkspacePermissionCatalogue } from 'modules/access/hooks/queries/useWorkspacePermissionCatalogue';
import { groupWorkspacePermissions } from 'modules/access/utils/workspace-permission-groups';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Conditional } from 'shared/components/Conditional';

/**
 * The read-only Workspace Permission catalogue with its assignable/reserved
 * classification (AC-32). The catalogue is system-managed (AC-18), so this tab
 * offers no control at all — the reserved entry stands in its own group and
 * says why it can never belong to a custom Workspace Role.
 *
 * The read owns its own `WORKSPACE_ROLES:WATCH` gate, so this tab neither
 * repeats that condition nor requests a catalogue its actor may not read.
 *
 * It names no wait of its own. `workspaceRoute`'s loader awaits the catalogue
 * before the destination paints, so first-paint readiness is the route's and
 * `RoutePendingState` is the one waiting affordance the application has
 * (`global-loader/change.md` CH-08, `sad.md` §4.8).
 */
export const WorkspacePermissionsTab = (): ReactElement => {
  const { t } = useTranslation('access');
  const permissionLabel = useWorkspacePermissionLabel();
  const { isError, permissions } = useWorkspacePermissionCatalogue();

  // The route's loader settles its secondary datasets, so this tab is mounted
  // on a rejected catalogue. `groupWorkspacePermissions([])` drops every group,
  // which would leave the description paragraph over nothing at all —
  // indistinguishable from a catalogue that is genuinely empty. Readiness is
  // the route's; error is this tab's (`frontend-architecture.md` §Page).
  if (isError) {
    return (
      <section
        aria-label={t('workspacePermissions.heading')}
        className="space-y-6"
      >
        <p role="alert" className="py-6 text-muted">
          {t('workspacePermissions.error')}
        </p>
      </section>
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
